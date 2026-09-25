import type { JobPostDto } from "@ever-hust/jobs-api";
import { mapJobToDb } from "../map-job";
import { locationKey, type RunGeocoder, type GeocodeRequest } from "./geocoder";
import {
  MAX_UPSERT_ROWS_PER_STATEMENT,
  mergeMayTakeOver,
  type ExistingJobRef,
  type JobRow,
  type JobStore,
  type WrittenRow,
} from "./job-store";

/**
 * The ingest core (spec 01a FR-6..FR-9): turns a stream of jobs into bulk upserts, one batch at a
 * time, with bounded memory. Shared by the `/api/jobs/sync` route and the in-process Trigger task.
 *
 * Per batch:
 *   1. existing rows for the batch's external ids (unique index),
 *   2. cross-run dedupe for *new* external ids that carry a `dedupKey` (spec D1/D2),
 *   3. geocoding for rows without usable stored coordinates (see {@link RunGeocoder}),
 *   4. one `INSERT … ON CONFLICT … DO UPDATE … WHERE … IS DISTINCT FROM …` statement in its own
 *      bounded transaction (the jobs-writer rule, `packages/db/src/jobs-insert.ts`), with a
 *      row-by-row fallback only when that statement fails.
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
   * Jobs that did not get a row of their own: a duplicate within the run (same external id or
   * dedupKey), or merged onto an existing row that carries the same dedupKey (spec D2).
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
  /** Called after every flushed batch (progress reporting). Must not throw. */
  onFlush?: () => void;
}

/** Cap on stored error messages (the counters stay exact). */
const MAX_ERROR_MESSAGES = 20;

export class JobIngestor {
  readonly counters = emptyCounters();
  readonly errorMessages: string[] = [];

  private readonly batchSize: number;
  private readonly maxConsecutiveFailedBatches: number;
  private buffer: JobPostDto[] = [];

  /**
   * Within-run identities: the first job seen wins. The sync asks Ever Jobs for every observation
   * (`dedup=false`, spec 01a D22), so this is THE within-run dedupe: by external id, by the
   * producer's `dedupKey` (company | title | location), and for a job without a key (a
   * pre-contract server) by {@link fallbackDedupIdentity}.
   */
  private readonly seenExternalIds = new Set<string>();
  private readonly seenDedupKeys = new Set<string>();
  private readonly seenFallbackIdentities = new Set<string>();

  /**
   * Cross-run dedupe state (per run): stored dedupKey → the row owning it; the titles/companies
   * already probed; the narrow candidate rows grouped by loose (title, company) identity; and the
   * candidate ids whose stored dedupKey was already read.
   */
  private readonly storedByDedupKey = new Map<string, { id: number; externalId: string }>();
  private readonly probedTitles = new Set<string>();
  private readonly probedCompanies = new Set<string>();
  private readonly candidatesByIdentity = new Map<string, Array<{ id: number; externalId: string }>>();
  private readonly groupedIds = new Set<number>();
  private readonly keyReadIds = new Set<number>();

  private consecutiveFailedBatches = 0;
  /** Rows the database accepted (inserted, rewritten, unchanged, or merged onto another row). */
  private rowsPersisted = 0;

  constructor(private readonly options: JobIngestorOptions) {
    // A batch is one INSERT under the jobs-writer rule's 60 s statement timeout: never larger.
    this.batchSize = Math.min(
      MAX_UPSERT_ROWS_PER_STATEMENT,
      Math.max(1, options.batchSize ?? MAX_UPSERT_ROWS_PER_STATEMENT),
    );
    this.maxConsecutiveFailedBatches = Math.max(1, options.maxConsecutiveFailedBatches ?? 3);
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

  /** Add one validated job; flushes a batch when the buffer is full. */
  async add(job: JobPostDto): Promise<void> {
    this.counters.received++;
    if (!isPersistable(job)) {
      this.counters.invalid++;
      return;
    }
    const dedupKey = normaliseDedupKey(job.dedupKey);
    const fallback = dedupKey ? undefined : fallbackDedupIdentity(job);
    if (
      this.seenExternalIds.has(job.id) ||
      (dedupKey !== undefined && this.seenDedupKeys.has(dedupKey)) ||
      (fallback !== undefined && this.seenFallbackIdentities.has(fallback))
    ) {
      this.counters.duplicatesMerged++;
      return;
    }
    this.seenExternalIds.add(job.id);
    if (dedupKey) this.seenDedupKeys.add(dedupKey);
    if (fallback) this.seenFallbackIdentities.add(fallback);
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

  /** Returns how many rows of the batch the database accepted. */
  private async persistBatch(batch: JobPostDto[]): Promise<number> {
    const { store } = this.options;

    // 1) Which external ids already exist?
    const existing = await store.findExisting(batch.map((j) => j.id));

    // 2) Cross-run dedupe, only for new external ids that carry a dedupKey.
    const fresh = batch.filter((j) => !existing.has(j.id) && normaliseDedupKey(j.dedupKey));
    if (fresh.length > 0) await this.probeDedupCandidates(fresh);

    // Pass 1: rows written under their own external id (batch ids are unique — see add()).
    const rows: JobRow[] = [];
    const targets = new Set<string>();
    const merges: Array<{ job: JobPostDto; owner: string }> = [];
    for (const job of batch) {
      const dedupKey = normaliseDedupKey(job.dedupKey);
      const owner = !existing.has(job.id) && dedupKey ? this.storedByDedupKey.get(dedupKey) : undefined;
      if (owner && owner.externalId !== job.id) {
        merges.push({ job, owner: owner.externalId });
        continue;
      }
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
        // The owner vanished since the probe (e.g. the cleanup deleted it): this job gets its own row.
        this.storedByDedupKey.delete(normaliseDedupKey(job.dedupKey) ?? "");
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

    // 3) Coordinates for rows that lack usable stored ones.
    await this.geocodeRows(rows, stored);

    // Counted only now: if a pre-query above throws, flush() counts the whole batch as errors.
    this.counters.duplicatesMerged += keptMerges;
    if (rows.length === 0) return keptMerges;

    // 4) One statement for the batch; a stable key order keeps concurrent runs deadlock-free.
    rows.sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
    try {
      const written = await store.upsertBatch(rows);
      this.countWrite(rows, written, mergedTargets);
      return rows.length + keptMerges;
    } catch (err) {
      this.recordError(
        `bulk upsert of ${rows.length} rows failed, retrying row by row: ${messageOf(err)}`,
      );
    }

    let ok = 0;
    for (const row of rows) {
      try {
        const written = await store.upsertBatch([row]);
        this.countWrite([row], written, mergedTargets);
        ok++;
      } catch (rowErr) {
        this.counters.errors++;
        this.recordError(`upsert of ${row.externalId} failed: ${messageOf(rowErr)}`);
      }
    }
    return ok;
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
   *   2. the stored dedupKey (`raw_data`, usually TOASTed) only for the candidates whose title AND
   *      company match an incoming job loosely (case, punctuation, corporate suffix), by id.
   */
  private async probeDedupCandidates(jobs: JobPostDto[]): Promise<void> {
    const { store } = this.options;
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
      // The oldest row (lowest id) owns the key.
      const current = this.storedByDedupKey.get(key);
      if (!current || c.id < current.id) {
        this.storedByDedupKey.set(key, { id: c.id, externalId: c.externalId });
      }
    }
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
 * stay apart. Used within a run only; the cross-run merge (D2) needs the producer's stored key.
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
  return err instanceof Error ? err.message : String(err);
}
