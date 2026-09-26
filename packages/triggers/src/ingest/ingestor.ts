import type { JobPostDto } from "@ever-hust/jobs-api";
import { mapJobToDb } from "../map-job";
import { errorText } from "./errors";
import { locationKey, type RunGeocoder, type GeocodeRequest } from "./geocoder";
import {
  MAX_UPSERT_ROWS_PER_STATEMENT,
  mergeMayTakeOver,
  type ExistingJobRef,
  type JobRow,
  type JobStore,
  type WriteNeed,
  type WrittenRow,
} from "./job-store";

/**
 * The ingest core (spec 01a FR-6..FR-9): turns a stream of jobs into bulk upserts, one batch at a
 * time, with bounded memory. Shared by the `/api/jobs/sync` route and the in-process Trigger task.
 *
 * Per batch:
 *   1. existing rows for the batch's external ids (unique index); an existing id is always
 *      written under itself (spec D23), whatever copies of it arrived before,
 *   2. within-run and cross-run dedupe for *new* external ids (spec D1/D2/D23): a job is a copy
 *      only of a posting from ANOTHER source with the same `dedupKey` (one source's two ids are two
 *      postings), and one copy absorbs at most one posting of each source,
 *   3. geocoding for rows without usable stored coordinates (see {@link RunGeocoder}),
 *   4. the upsert's `WHERE` read ahead for rows that exist (spec D24): unchanged rows are not sent,
 *      rows only due their weekly last-seen refresh get a narrow `UPDATE … SET updated_at`,
 *   5. one `INSERT … ON CONFLICT … DO UPDATE … WHERE … IS DISTINCT FROM …` statement for new and
 *      changed rows, in its own bounded transaction (the jobs-writer rule,
 *      `packages/db/src/jobs-insert.ts`), with a row-by-row fallback only when that statement
 *      fails, which stops at the run's deadline or after a few rows in a row failed (spec D25).
 *
 * Counter invariant (every received job lands in exactly one bucket):
 *   received = inserted + updated + unchanged + invalid + duplicatesMerged + errors
 * `mergedWrites` is not a bucket: it counts the merges (already in `duplicatesMerged`) that
 * actually rewrote the owning row, so the summary shows the real write volume.
 */

export interface IngestCounters {
  /** Job lines received from upstream (valid + invalid). */
  received: number;
  inserted: number;
  /**
   * Existing rows rewritten because their content changed, or because their weekly last-seen
   * refresh was due (keeps `updated_at` meaningful for the 90-day cleanup).
   */
  updated: number;
  /** Existing rows left untouched because nothing meaningful changed (and seen recently). */
  unchanged: number;
  /** Jobs skipped as invalid (failed validation or missing id/site/title). */
  invalid: number;
  /**
   * Jobs that did not get a row of their own: a duplicate within the run (the same external id, or
   * the same dedupKey / fallback identity from ANOTHER source, spec D23), or merged onto an existing
   * row of another source that carries the same dedupKey (spec D2).
   */
  duplicatesMerged: number;
  /**
   * Of `duplicatesMerged`: merges that rewrote the owning row — a takeover of a row its own source
   * stopped refreshing (spec D2). Every other merge leaves the row untouched.
   */
  mergedWrites: number;
  geocodeCalls: number;
  geocodeReused: number;
  /** Jobs that failed to persist. */
  errors: number;
}

export function emptyCounters(): IngestCounters {
  return {
    received: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    invalid: 0,
    duplicatesMerged: 0,
    mergedWrites: 0,
    geocodeCalls: 0,
    geocodeReused: 0,
    errors: 0,
  };
}

export interface IngestLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Thrown when several consecutive batches failed entirely — the database is unusable. */
export class IngestAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestAbortedError";
  }
}


export interface JobIngestorOptions {
  store: JobStore;
  geocoder: RunGeocoder;
  /** Jobs per batch (default and maximum {@link MAX_UPSERT_ROWS_PER_STATEMENT}: one statement each). */
  batchSize?: number;
  logger?: IngestLogger;
  /** Give up after this many consecutive batches with nothing persisted (default 3). */
  maxConsecutiveFailedBatches?: number;
  /**
   * The row-by-row fallback stops after this many rows in a row failed (default
   * {@link MAX_CONSECUTIVE_ROW_FAILURES}); the rest of the batch is counted as errors.
   */
  maxConsecutiveRowFailures?: number;
  /**
   * The run's deadline (epoch ms): past it, the row-by-row fallback writes no further row (each
   * may take the jobs-writer rule's full statement timeout). Default: none.
   */
  deadlineAt?: number;
  now?: () => number;
  /** Candidate rows the dedup probe caches before starting over (default {@link MAX_DEDUP_PROBE_CACHE_ROWS}). */
  dedupProbeCacheRows?: number;
  /** Called after every flushed batch (progress reporting). Must not throw. */
  onFlush?: () => void;
}

/** Cap on stored error messages (the counters stay exact). */
const MAX_ERROR_MESSAGES = 20;

/**
 * Consecutive failed rows after which the row-by-row fallback gives the batch up (spec D25).
 * Each row is its own bounded INSERT (up to the jobs-writer rule's 60 s statement timeout plus its
 * idle bound), so a database that rejects every row would otherwise hold the run for up to
 * 250 × 70 s per batch.
 */
export const MAX_CONSECUTIVE_ROW_FAILURES = 5;

/**
 * Candidate rows the cross-run dedup probe keeps cached per run before it starts over (spec
 * NFR-1): the narrow rows of every company probed would otherwise grow with the whole table on a
 * first full run. Starting over only costs repeated probe queries, never a wrong merge.
 */
export const MAX_DEDUP_PROBE_CACHE_ROWS = 50_000;

/**
 * One source's jobs with one within-run identity: `seen` counts every job of that source the run
 * processed with it (kept, dropped as a copy, or merged onto a stored row), `kept` those that got
 * a row of their own.
 */
interface SourceCount {
  site: string;
  seen: number;
  kept: number;
}

/**
 * The within-run mark of one identity (a dedupKey, or the fallback identity of a job without one),
 * per source. A plain string is the common case, kept small: one job of that source, kept.
 */
type Mark = string | readonly SourceCount[];

function sourceCounts(mark: Mark | undefined): SourceCount[] {
  if (mark === undefined) return [];
  if (typeof mark === "string") return [{ site: mark, seen: 1, kept: 1 }];
  return mark.map((c) => ({ ...c }));
}

/** `mark` with one source's counts moved by `seen` / `kept` (never below 0 kept). */
function recount(mark: Mark | undefined, site: string, seen: number, kept: number): Mark {
  if (mark === undefined && seen === 1 && kept === 1) return site;
  const counts = sourceCounts(mark);
  let entry = counts.find((c) => c.site === site);
  if (!entry) {
    entry = { site, seen: 0, kept: 0 };
    counts.push(entry);
  }
  entry.seen += seen;
  entry.kept = Math.max(0, entry.kept + kept);
  const only = counts.length === 1 ? counts[0]! : undefined;
  return only && only.seen === 1 && only.kept === 1 ? only.site : counts;
}

/**
 * A job from `site` is a copy of a posting kept for another source while its own source has had
 * fewer jobs with this identity than another source kept (spec D23): a row kept for one source
 * absorbs at most one job of each other source, so one copy never swallows several postings of
 * the source it copies. `counted`: the job itself is already among its source's `seen`.
 */
function isCopyOf(mark: Mark | undefined, site: string, counted = false): boolean {
  if (mark === undefined) return false;
  // One job of another source kept, none of this one's seen (a counted job always has an entry).
  if (typeof mark === "string") return mark !== site;
  let seen = counted ? -1 : 0;
  let otherKept = 0;
  for (const c of mark) {
    if (c.site === site) seen += c.seen;
    else if (c.kept > otherKept) otherKept = c.kept;
  }
  return seen < otherKept;
}

/**
 * The run's within-run marks plus this batch's. The batch's are committed once its writes are
 * done, without the rows that were not written (a copy must not be dropped for a row that does
 * not exist), and not at all when a pre-query failed.
 */
class BatchMarks {
  private readonly added = new Map<string, Mark>();
  constructor(private readonly run: Map<string, Mark>) {}

  private get(identity: string): Mark | undefined {
    return this.added.get(identity) ?? this.run.get(identity);
  }

  /** A job from `site` with this identity is a copy of a posting kept for another source. */
  isCopy(identity: string, site: string, counted = false): boolean {
    return isCopyOf(this.get(identity), site, counted);
  }

  /** Jobs of `site` with this identity that got a row of their own in the run so far. */
  keptFor(identity: string, site: string): number {
    const mark = this.get(identity);
    if (mark === undefined) return 0;
    if (typeof mark === "string") return mark === site ? 1 : 0;
    return mark.find((c) => c.site === site)?.kept ?? 0;
  }

  /** Count a job from `site`; `kept` when it gets a row of its own. */
  count(identity: string, site: string, kept: boolean): void {
    this.added.set(identity, recount(this.get(identity), site, 1, kept ? 1 : 0));
  }

  /** A counted job that gets a row of its own after all (the row it was to merge onto vanished). */
  keepCounted(identity: string, site: string): void {
    this.added.set(identity, recount(this.get(identity), site, 0, 1));
  }

  /** A kept job whose row was not written: it holds no row (it still counts as seen). */
  withdraw(identity: string, site: string): void {
    this.added.set(identity, recount(this.get(identity), site, 0, -1));
  }

  commit(): void {
    for (const [identity, mark] of this.added) this.run.set(identity, mark);
  }
}

/**
 * Stored rows (by id) that absorbed a new job this run, with the sources of those jobs: a stored
 * row absorbs at most one new job per source per run (spec D23). The batch's entries are committed
 * with its marks.
 */
class BatchAbsorptions {
  private readonly added: Array<[number, string]> = [];
  constructor(private readonly run: Map<number, string[]>) {}

  has(rowId: number, site: string): boolean {
    return (
      (this.run.get(rowId)?.includes(site) ?? false) ||
      this.added.some(([id, s]) => id === rowId && s === site)
    );
  }

  add(rowId: number, site: string): void {
    this.added.push([rowId, site]);
  }

  commit(): void {
    for (const [id, site] of this.added) {
      const sites = this.run.get(id);
      if (sites) sites.push(site);
      else this.run.set(id, [site]);
    }
  }
}

/** A stored row owning a dedupKey (see {@link JobIngestor.storedOwnerFor}). */
interface StoredOwner {
  id: number;
  externalId: string;
  site: string;
  sourceId: string | null;
}

export class JobIngestor {
  readonly counters = emptyCounters();
  readonly errorMessages: string[] = [];

  private readonly batchSize: number;
  private readonly maxConsecutiveFailedBatches: number;
  private readonly maxConsecutiveRowFailures: number;
  private readonly now: () => number;
  private buffer: JobPostDto[] = [];

  /**
   * Within-run identities. The sync asks Ever Jobs for every observation (`dedup=false`, spec 01a
   * D22), so this is THE within-run dedupe: an external id is kept once, and a job is dropped as a
   * copy when a posting from ANOTHER source with the same producer `dedupKey` (company | title |
   * location), or for a job without a key (a pre-contract server) the same
   * {@link fallbackDedupIdentity}, was kept earlier in the run. One source's two ids with the
   * same key are two postings (one employer's new-grad and intern role with the same title in the
   * same city, spec D23) and both are kept, and one copy absorbs at most one of them. Marks count
   * each identity's jobs per source (see {@link isCopyOf}).
   */
  private readonly seenExternalIds = new Set<string>();
  private readonly keptKeys = new Map<string, Mark>();
  private readonly keptFallbacks = new Map<string, Mark>();
  /** Stored rows that absorbed a new job this run, per source (see {@link BatchAbsorptions}). */
  private readonly absorbed = new Map<number, string[]>();
  /** One string per source name, shared by every mark (the marks grow with the run). */
  private readonly siteNames = new Map<string, string>();

  /**
   * Cross-run dedupe state (per run, capped by {@link MAX_DEDUP_PROBE_CACHE_ROWS}): stored dedupKey
   * → the rows owning it (oldest first); the titles/companies already probed; the narrow candidate
   * rows grouped by loose (title, company) identity; and the candidate ids whose stored dedupKey was
   * already read.
   */
  private readonly storedByDedupKey = new Map<string, StoredOwner[]>();
  private readonly probedTitles = new Set<string>();
  private readonly probedCompanies = new Set<string>();
  private readonly candidatesByIdentity = new Map<string, Array<{ id: number; externalId: string }>>();
  private readonly groupedIds = new Set<number>();
  private readonly keyReadIds = new Set<number>();

  private consecutiveFailedBatches = 0;
  /** Rows the database accepted (inserted, rewritten, refreshed, unchanged, or merged onto another row). */
  private rowsPersisted = 0;

  constructor(private readonly options: JobIngestorOptions) {
    // A batch is one INSERT under the jobs-writer rule's 60 s statement timeout: never larger.
    this.batchSize = Math.min(
      MAX_UPSERT_ROWS_PER_STATEMENT,
      Math.max(1, options.batchSize ?? MAX_UPSERT_ROWS_PER_STATEMENT),
    );
    this.maxConsecutiveFailedBatches = Math.max(1, options.maxConsecutiveFailedBatches ?? 3);
    this.maxConsecutiveRowFailures = Math.max(1, options.maxConsecutiveRowFailures ?? MAX_CONSECUTIVE_ROW_FAILURES);
    this.now = options.now ?? Date.now;
  }

  /** Rows the database accepted so far (within-run duplicates are not writes and not counted). */
  get persisted(): number {
    return this.rowsPersisted;
  }

  /** Count a job line that failed validation upstream (the client's zod check). */
  noteInvalid(reason?: string): void {
    this.counters.received++;
    this.counters.invalid++;
    if (reason && this.counters.invalid <= 3) {
      this.options.logger?.warn(`[jobs-sync] skipping invalid job: ${reason}`);
    }
  }

  /**
   * Add one validated job; flushes a batch when the buffer is full. Only an external id seen
   * before is dropped here: whether a job is a copy of another source's posting depends on
   * whether its own id already exists (an existing id is always written, spec D23), which the
   * batch learns in one query.
   */
  async add(job: JobPostDto): Promise<void> {
    this.counters.received++;
    if (!isPersistable(job)) {
      this.counters.invalid++;
      return;
    }
    if (this.seenExternalIds.has(job.id)) {
      this.counters.duplicatesMerged++;
      return;
    }
    this.seenExternalIds.add(job.id);
    this.buffer.push(job);
    if (this.buffer.length >= this.batchSize) await this.flush();
  }

  /**
   * Persist whatever is buffered. Throws {@link IngestAbortedError} once
   * `maxConsecutiveFailedBatches` batches in a row persisted nothing.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];

    let ok = 0;
    try {
      ok = await this.persistBatch(batch);
    } catch (err) {
      // A pre-query failed (existence / dedupe) — nothing in the batch was written.
      this.counters.errors += batch.length;
      this.recordError(`batch of ${batch.length} failed: ${messageOf(err)}`);
    }

    try {
      this.options.onFlush?.();
    } catch {
      // progress reporting must never break ingestion
    }
    if (ok > 0) {
      this.consecutiveFailedBatches = 0;
      return;
    }
    this.consecutiveFailedBatches++;
    if (this.consecutiveFailedBatches >= this.maxConsecutiveFailedBatches) {
      throw new IngestAbortedError(
        `${this.consecutiveFailedBatches} consecutive batches failed to persist; aborting the run`,
      );
    }
  }

  /** Returns how many jobs of the batch were settled without an error (written, unchanged or merged). */
  private async persistBatch(batch: JobPostDto[]): Promise<number> {
    const { store } = this.options;

    // 1) Which external ids already exist? Those are their sources' own rows: always written
    //    under their own id (spec D23), even when another source's copy arrived first this run.
    const existing = await store.findExisting(batch.map((j) => j.id));

    const keys = new BatchMarks(this.keptKeys);
    const fallbacks = new BatchMarks(this.keptFallbacks);
    const absorptions = new BatchAbsorptions(this.absorbed);
    const rows: JobRow[] = [];
    const targets = new Set<string>();
    const fresh: JobPostDto[] = [];
    /** New ids given a row of their own in this batch (their marks go if the row is not written). */
    const keptFresh = new Map<string, JobPostDto>();
    for (const job of batch) {
      if (!existing.has(job.id)) {
        fresh.push(job);
        continue;
      }
      this.count(job, keys, fallbacks, true);
      targets.add(job.id);
      rows.push(mapJobToDb(job));
    }

    // 2) Cross-run dedupe probe for new external ids with a dedupKey. (Whether one is a copy of a
    //    posting kept in this run depends on the jobs of its source before it in this batch, so
    //    none is left out; the probe is cached per title / company anyway.)
    const toProbe = fresh.filter((j) => normaliseDedupKey(j.dedupKey) !== undefined);
    if (toProbe.length > 0) await this.probeDedupCandidates(toProbe);

    // Pass 1: new ids, in stream order — a copy of a posting kept in this run is dropped, a copy
    // of a stored row of another source merges onto it, anything else gets its own row.
    let copies = 0;
    const merges: Array<{ job: JobPostDto; owner: string }> = [];
    for (const job of fresh) {
      if (this.isCopy(job, keys, fallbacks)) {
        this.count(job, keys, fallbacks, false);
        copies++;
        continue;
      }
      const key = normaliseDedupKey(job.dedupKey);
      const owner = key !== undefined ? this.storedOwnerFor(key, job, keys, absorptions) : undefined;
      if (owner) {
        this.count(job, keys, fallbacks, false);
        merges.push({ job, owner: owner.externalId });
        continue;
      }
      this.count(job, keys, fallbacks, true);
      keptFresh.set(job.id, job);
      targets.add(job.id);
      rows.push(mapJobToDb(job));
    }

    // Pass 2: merges onto the row that owns the dedupKey (spec D2). The owner keeps its id,
    // external_id, created_at AND content: two sources of one posting must not make the row flip
    // between them on every run. Only an owner that has not been refreshed for the takeover window
    // (its own source stopped listing it) is taken over — rewritten with this source's content
    // (raw_data keeps this source's own id). An exact external-id match in the same batch wins.
    let stored: Map<string, ExistingJobRef> = existing;
    const ownersToLoad = [
      ...new Set(merges.map((m) => m.owner).filter((id) => !existing.has(id) && !targets.has(id))),
    ];
    if (ownersToLoad.length > 0) {
      stored = new Map([...existing, ...(await store.findExisting(ownersToLoad))]);
    }

    const mergedTargets = new Set<string>();
    let keptMerges = 0;
    for (const { job, owner } of merges) {
      if (targets.has(owner)) {
        keptMerges++;
        continue;
      }
      const ownerRef = stored.get(owner);
      const row = mapJobToDb(job);
      if (!ownerRef) {
        // The owner vanished since the probe (e.g. the cleanup deleted it): this job gets its own
        // row, unless an earlier job of this pass took that place for another source.
        this.forgetStoredOwner(normaliseDedupKey(job.dedupKey), owner);
        const [marks, identity] = this.marksOf(job, keys, fallbacks);
        if (marks.isCopy(identity, this.siteOf(job), true)) {
          copies++;
          continue;
        }
        marks.keepCounted(identity, this.siteOf(job));
        keptFresh.set(job.id, job);
        targets.add(job.id);
        rows.push(row);
        continue;
      }
      if (!mergeMayTakeOver(ownerRef.updatedAt, row.updatedAt)) {
        keptMerges++; // the owner's content stays; nothing to write
        continue;
      }
      row.externalId = owner;
      targets.add(owner);
      mergedTargets.add(owner);
      rows.push(row);
    }

    // Every pre-query succeeded. (If one had thrown, flush() counts the whole batch as errors and
    // none of this happened.)
    this.counters.duplicatesMerged += copies + keptMerges;
    const settled = copies + keptMerges;

    // 3) Coordinates for rows that lack usable stored ones.
    await this.geocodeRows(rows, stored);

    // 4) What the rows that exist actually need (spec D24).
    const { write, refresh, unchanged } = await this.sortByNeed(rows, stored);
    this.countWrite(unchanged, [], mergedTargets);
    let accepted = settled + unchanged.length;
    accepted += await this.refreshLastSeen(refresh, mergedTargets);

    // 5) New and changed rows.
    const { ok, failed } = await this.writeRows(write, mergedTargets);

    // The batch's marks and absorptions become the run's, without the new rows that were not
    // written: another source's copy of one of those is not a copy of anything stored.
    for (const externalId of failed) {
      const job = keptFresh.get(externalId);
      if (!job) continue;
      const [marks, identity] = this.marksOf(job, keys, fallbacks);
      marks.withdraw(identity, this.siteOf(job));
    }
    keys.commit();
    fallbacks.commit();
    absorptions.commit();
    return accepted + ok;
  }

  /**
   * One statement for the batch's rows (a stable key order keeps concurrent runs deadlock-free),
   * and the bounded row-by-row fallback when it fails (spec D25). Returns how many rows were
   * accepted and the external ids that were not written.
   */
  private async writeRows(
    write: JobRow[],
    mergedTargets: Set<string>,
  ): Promise<{ ok: number; failed: string[] }> {
    const { store } = this.options;
    if (write.length === 0) return { ok: 0, failed: [] };
    write.sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
    try {
      const written = await store.upsertBatch(write);
      this.countWrite(write, written, mergedTargets);
      return { ok: write.length, failed: [] };
    } catch (err) {
      this.recordError(
        `bulk upsert of ${write.length} rows failed, retrying row by row: ${messageOf(err)}`,
      );
    }

    let ok = 0;
    let failedInARow = 0;
    const failed: string[] = [];
    for (const [i, row] of write.entries()) {
      const stop =
        failedInARow >= this.maxConsecutiveRowFailures
          ? `${failedInARow} rows in a row failed`
          : this.options.deadlineAt !== undefined && this.now() >= this.options.deadlineAt
            ? "the run's deadline passed"
            : null;
      if (stop) {
        const left = write.slice(i);
        this.counters.errors += left.length;
        for (const r of left) failed.push(r.externalId);
        this.recordError(`row-by-row fallback stopped (${stop}); ${left.length} of ${write.length} rows not written`);
        break;
      }
      try {
        const written = await store.upsertBatch([row]);
        this.countWrite([row], written, mergedTargets);
        ok++;
        failedInARow = 0;
      } catch (rowErr) {
        this.counters.errors++;
        failedInARow++;
        failed.push(row.externalId);
        this.recordError(`upsert of ${row.externalId} failed: ${messageOf(rowErr)}`);
      }
    }
    return { ok, failed };
  }

  /**
   * Split the batch's rows by what they need: rows whose external id does not exist are written;
   * for the others the upsert's `WHERE` is read ahead (spec D24). When that read fails, every row
   * goes to the upsert, whose own `WHERE` still skips unchanged rows (at the cost of locking them).
   */
  private async sortByNeed(
    rows: JobRow[],
    stored: Map<string, ExistingJobRef>,
  ): Promise<{ write: JobRow[]; refresh: JobRow[]; unchanged: JobRow[] }> {
    const out = { write: [] as JobRow[], refresh: [] as JobRow[], unchanged: [] as JobRow[] };
    const existingRows = rows.filter((r) => stored.has(r.externalId));
    let needs: Map<string, WriteNeed> | null = null;
    if (existingRows.length > 0) {
      try {
        needs = await this.options.store.findWriteNeeds(existingRows);
      } catch (err) {
        this.options.logger?.warn(
          `[jobs-sync] reading which of ${existingRows.length} existing rows changed failed; sending them to the upsert: ${messageOf(err)}`,
        );
      }
    }
    for (const row of rows) {
      if (!stored.has(row.externalId) || needs === null) {
        out.write.push(row);
        continue;
      }
      const need = needs.get(row.externalId);
      if (need === "write") out.write.push(row);
      else if (need === "refresh") out.refresh.push(row);
      else out.unchanged.push(row);
    }
    return out;
  }

  /** The narrow last-seen refresh (spec D14/D24). Returns the rows settled (refreshed or not due). */
  private async refreshLastSeen(rows: JobRow[], mergedTargets: Set<string>): Promise<number> {
    if (rows.length === 0) return 0;
    const seenAt = new Date(Math.max(...rows.map((r) => r.updatedAt.getTime())));
    try {
      const refreshed = await this.options.store.refreshLastSeen(
        rows.map((r) => r.externalId),
        seenAt,
      );
      this.countWrite(
        rows,
        refreshed.map((externalId) => ({ externalId, inserted: false })),
        mergedTargets,
      );
      return rows.length;
    } catch (err) {
      this.counters.errors += rows.length;
      this.recordError(`last-seen refresh of ${rows.length} rows failed: ${messageOf(err)}`);
      return 0;
    }
  }

  private siteOf(job: Pick<JobPostDto, "site">): string {
    const site = job.site.trim().toLowerCase();
    const shared = this.siteNames.get(site);
    if (shared !== undefined) return shared;
    this.siteNames.set(site, site);
    return site;
  }

  /** The marks a job's within-run identity lives in: its dedupKey, else its fallback identity. */
  private marksOf(job: JobPostDto, keys: BatchMarks, fallbacks: BatchMarks): [BatchMarks, string] {
    const key = normaliseDedupKey(job.dedupKey);
    return key !== undefined ? [keys, key] : [fallbacks, fallbackDedupIdentity(job)];
  }

  /** A job that is a copy of a posting kept in this run for another source (spec D23). */
  private isCopy(job: JobPostDto, keys: BatchMarks, fallbacks: BatchMarks): boolean {
    const [marks, identity] = this.marksOf(job, keys, fallbacks);
    return marks.isCopy(identity, this.siteOf(job));
  }

  /** Count a job under its within-run identity; `kept` when it gets a row of its own. */
  private count(job: JobPostDto, keys: BatchMarks, fallbacks: BatchMarks, kept: boolean): void {
    const [marks, identity] = this.marksOf(job, keys, fallbacks);
    marks.count(identity, this.siteOf(job), kept);
  }

  /**
   * The stored row a new job is a copy of (spec D2/D23), if any:
   *   - the row that holds this very job's content (a row it took over earlier: its `raw_data.id`
   *     is the job's id) — that row is the job;
   *   - none when the job's source already has a row with this key (stored, or kept earlier in
   *     this run): the job is another posting of that source, and another source's row with the
   *     key is a copy of one the source already has;
   *   - else the oldest row of another source that has not absorbed a job of this source yet in
   *     this run: one copy absorbs at most one posting of each source.
   * Recording the absorption is part of the answer (the batch commits it with its marks).
   */
  private storedOwnerFor(
    key: string,
    job: JobPostDto,
    keys: BatchMarks,
    absorptions: BatchAbsorptions,
  ): StoredOwner | undefined {
    const owners = this.storedByDedupKey.get(key)?.filter((o) => o.externalId !== job.id);
    if (!owners || owners.length === 0) return undefined;
    const content = owners.find((o) => o.sourceId === job.id);
    if (content) return content;
    const site = this.siteOf(job);
    if (keys.keptFor(key, site) > 0 || owners.some((o) => this.siteOf(o) === site)) return undefined;
    const owner = owners.find((o) => !absorptions.has(o.id, site));
    if (owner) absorptions.add(owner.id, site);
    return owner;
  }

  private forgetStoredOwner(key: string | undefined, externalId: string): void {
    if (key === undefined) return;
    const owners = this.storedByDedupKey.get(key)?.filter((o) => o.externalId !== externalId);
    if (owners && owners.length > 0) this.storedByDedupKey.set(key, owners);
    else this.storedByDedupKey.delete(key);
  }

  private async geocodeRows(rows: JobRow[], stored: Map<string, ExistingJobRef>): Promise<void> {
    const { geocoder } = this.options;
    const requests: Array<GeocodeRequest & { row: JobRow }> = [];
    for (const row of rows) {
      const key = locationKey({
        city: row.locationCity,
        state: row.locationState,
        country: row.locationCountry,
      });
      if (!key) continue;
      const current = stored.get(row.externalId);
      // Stored coordinates for an unchanged location stay (the upsert keeps them).
      if (current?.hasCoords && current.locationKey === key) continue;
      requests.push({
        key,
        parts: { city: row.locationCity, state: row.locationState, country: row.locationCountry },
        row,
      });
    }
    if (requests.length === 0) return;

    const callsBefore = geocoder.calls;
    const reusedBefore = geocoder.reused;
    const coords = await geocoder.resolve(requests);
    this.counters.geocodeCalls += geocoder.calls - callsBefore;
    this.counters.geocodeReused += geocoder.reused - reusedBefore;
    for (const req of requests) {
      const c = coords.get(req.key);
      if (c) {
        req.row.latitude = c.latitude;
        req.row.longitude = c.longitude;
      }
    }
  }

  /**
   * Cross-run dedupe probe (spec 01a D1), two cheap steps instead of reading `raw_data` for every
   * row of every company in the batch:
   *   1. narrow rows (id, external_id, title, company) sharing an exact title OR company — once per
   *      title/company per run, through the btree indexes;
   *   2. the stored dedupKey (`raw_data`, usually TOASTed), with the row's source and the source id
   *      of its content, only for the candidates whose title AND company match an incoming job
   *      loosely (case, punctuation, corporate suffix), by id.
   * The cache of step 1 starts over once it holds {@link MAX_DEDUP_PROBE_CACHE_ROWS} rows.
   */
  private async probeDedupCandidates(jobs: JobPostDto[]): Promise<void> {
    const { store } = this.options;
    if (this.groupedIds.size >= (this.options.dedupProbeCacheRows ?? MAX_DEDUP_PROBE_CACHE_ROWS)) {
      this.resetProbeCache();
    }
    const titles = new Set<string>();
    const companies = new Set<string>();
    for (const j of jobs) {
      if (!this.probedTitles.has(j.title)) titles.add(j.title);
      if (j.companyName && !this.probedCompanies.has(j.companyName)) companies.add(j.companyName);
    }
    if (titles.size > 0 || companies.size > 0) {
      const refs = await store.findDedupCandidates({ titles: [...titles], companies: [...companies] });
      for (const t of titles) this.probedTitles.add(t);
      for (const c of companies) this.probedCompanies.add(c);
      for (const ref of refs) {
        if (this.groupedIds.has(ref.id)) continue;
        this.groupedIds.add(ref.id);
        const identity = looseIdentity(ref.title, ref.companyName);
        const group = this.candidatesByIdentity.get(identity);
        const entry = { id: ref.id, externalId: ref.externalId };
        if (group) group.push(entry);
        else this.candidatesByIdentity.set(identity, [entry]);
      }
    }

    const ids = new Set<number>();
    for (const j of jobs) {
      for (const c of this.candidatesByIdentity.get(looseIdentity(j.title, j.companyName)) ?? []) {
        if (!this.keyReadIds.has(c.id)) ids.add(c.id);
      }
    }
    if (ids.size === 0) return;
    const keyed = await store.findDedupKeys([...ids]);
    for (const id of ids) this.keyReadIds.add(id);
    for (const c of keyed) {
      const key = normaliseDedupKey(c.dedupKey);
      if (!key) continue;
      const owner: StoredOwner = { id: c.id, externalId: c.externalId, site: c.site, sourceId: c.sourceId };
      const owners = this.storedByDedupKey.get(key);
      if (!owners) {
        this.storedByDedupKey.set(key, [owner]);
        continue;
      }
      if (owners.some((o) => o.id === c.id)) continue;
      // Oldest first: the oldest row of another source owns the key.
      owners.push(owner);
      owners.sort((a, b) => a.id - b.id);
    }
  }

  private resetProbeCache(): void {
    this.storedByDedupKey.clear();
    this.probedTitles.clear();
    this.probedCompanies.clear();
    this.candidatesByIdentity.clear();
    this.groupedIds.clear();
    this.keyReadIds.clear();
  }

  private countWrite(rows: JobRow[], written: WrittenRow[], mergedTargets: Set<string>): void {
    const outcome = new Map(written.map((w) => [w.externalId, w.inserted]));
    this.rowsPersisted += rows.length;
    for (const row of rows) {
      if (mergedTargets.has(row.externalId)) {
        this.counters.duplicatesMerged++;
        if (outcome.has(row.externalId)) this.counters.mergedWrites++;
        continue;
      }
      const inserted = outcome.get(row.externalId);
      if (inserted === true) this.counters.inserted++;
      else if (inserted === false) this.counters.updated++;
      else this.counters.unchanged++;
    }
  }

  private recordError(message: string): void {
    this.options.logger?.error(`[jobs-sync] ${message}`);
    if (this.errorMessages.length < MAX_ERROR_MESSAGES) this.errorMessages.push(message);
  }
}

/** Corporate suffixes ignored when comparing company names loosely. */
const COMPANY_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "ltd", "limited", "co", "corp", "corporation", "company",
  "gmbh", "plc", "sa", "ag", "bv", "lp", "llp", "pte", "pty", "srl", "sas", "oy", "ab",
]);

function looseText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // combining marks left by NFKD (é → e)
    .toLowerCase()
    .replace(/\./g, "") // "S.A." ≡ "SA", "Inc." ≡ "Inc"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Loose (title, company) identity used to pick dedup candidates: case, accents, punctuation and
 * trailing corporate suffixes ("Acme, Inc." ≡ "acme") do not matter. A miss only costs a
 * duplicate row, never a wrong merge — the stored dedupKey still has to match exactly.
 */
export function looseIdentity(title: string, company: string | null | undefined): string {
  const words = looseText(company).split(" ").filter(Boolean);
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return `${looseText(title)}|${words.join(" ")}`;
}

/**
 * Within-run identity of a job that arrived WITHOUT a `dedupKey`: a pre-contract Ever Jobs stamps
 * none, and it honours `dedup=false` too, so without this its cross-source copies of one posting
 * would all be stored. Company + title + location, each compared loosely: the same parts as the
 * producer's key (company | title | location), so two postings of one title in different cities
 * stay apart; like the key, it only makes a job from ANOTHER source a copy (spec D23). Used within
 * a run only; the cross-run merge (D2) needs the producer's stored key.
 */
export function fallbackDedupIdentity(job: Pick<JobPostDto, "title" | "companyName" | "location">): string {
  const loc = job.location ?? {};
  return `${looseIdentity(job.title, job.companyName)}|${[loc.city, loc.state, loc.country].map(looseText).join("|")}`;
}

function isPersistable(job: JobPostDto): boolean {
  return [job.id, job.site, job.title].every((v) => typeof v === "string" && v.trim() !== "");
}

function normaliseDedupKey(key: unknown): string | undefined {
  return typeof key === "string" && key.trim() !== "" ? key.trim() : undefined;
}

function messageOf(err: unknown): string {
  return errorText(err);
}
