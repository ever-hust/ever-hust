import { locationKey, type Coords } from "../geocoder";
import {
  LAST_SEEN_REFRESH_DAYS,
  MAX_UPSERT_ROWS_PER_STATEMENT,
  mergeMayTakeOver,
  type DedupCandidate,
  type DedupCandidateRef,
  type ExistingJobRef,
  type JobRow,
  type JobStore,
  type StaleSource,
  type WriteNeed,
  type WrittenRow,
} from "../job-store";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory {@link JobStore} for unit tests. It mirrors the semantics of the Drizzle store:
 * `upsertBatch` rejects duplicate external ids in one statement (as Postgres does), inserts new
 * rows, rewrites an existing row only when a content column changed / coordinates or the dedup
 * identity get backfilled or its last-seen marker is older than the refresh window, and keeps
 * stored coordinates when the incoming row has none. A merge row (`rawData.id` ≠ `externalId`)
 * only rewrites an owner older than the takeover window. `findWriteNeeds` evaluates the same
 * predicate, split into "write" and "refresh" (a missing row is "write"); `refreshLastSeen` only
 * moves `updatedAt`; `findStaleSources` groups rows by source.
 */

export interface StoredRow extends JobRow {
  id: number;
}

const CONTENT_KEYS: Array<keyof JobRow> = [
  "site",
  "title",
  "companyName",
  "companyUrl",
  "companyLogo",
  "companyIndustry",
  "companyNumEmployees",
  "companyDescription",
  "jobUrl",
  "jobUrlDirect",
  "applyUrl",
  "locationCity",
  "locationState",
  "locationCountry",
  "isRemote",
  "jobType",
  "description",
  "skills",
  "department",
  "team",
  "employmentType",
  "jobLevel",
  "jobFunction",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryInterval",
  "datePosted",
  "expiresAt",
];

/** Mirrors `incomingSignals()`: a missing verdict keeps the stored one; reasons follow the verdict. */
function effectiveSignals(current: StoredRow, row: JobRow) {
  const legitimacy = row.legitimacy ?? current.legitimacy ?? null;
  return {
    liveness: row.liveness ?? current.liveness ?? null,
    legitimacy,
    legitimacyReasons: row.legitimacy != null ? (row.legitimacyReasons ?? null) : (current.legitimacyReasons ?? null),
  };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const rawField = (row: JobRow, key: string) =>
  (row.rawData as Record<string, unknown> | null | undefined)?.[key];

/** Mirrors the parts of `upsertChangedPredicate()`: "write" (the CASE without the last-seen clause), "refresh", or null. */
function needOf(current: StoredRow, row: JobRow): WriteNeed | null {
  const sourceId = rawField(row, "id");
  if (typeof sourceId === "string" && sourceId !== row.externalId) {
    // A cross-run merge row: only a stale owner is taken over, and it is never just refreshed.
    return mergeMayTakeOver(current.updatedAt, row.updatedAt) ? "write" : null;
  }
  const signals = effectiveSignals(current, row);
  const changed =
    CONTENT_KEYS.some((k) => !same(current[k], row[k])) ||
    !same(current.liveness, signals.liveness) ||
    !same(current.legitimacy, signals.legitimacy) ||
    !same(current.legitimacyReasons, signals.legitimacyReasons) ||
    (current.latitude == null && row.latitude != null) ||
    !same(rawField(current, "dedupKey"), rawField(row, "dedupKey")) ||
    !same(rawField(current, "careerLevel"), rawField(row, "careerLevel"));
  if (changed) return "write";
  return isStale(current.updatedAt, row.updatedAt) ? "refresh" : null;
}

function isStale(storedAt: Date | undefined, seenAt: Date | undefined): boolean {
  return (
    storedAt instanceof Date &&
    seenAt instanceof Date &&
    storedAt.getTime() < seenAt.getTime() - LAST_SEEN_REFRESH_DAYS * DAY_MS
  );
}

/** Mirrors `upsertChangedPredicate()` as a whole (the upsert's WHERE). */
function shouldRewrite(current: StoredRow, row: JobRow): boolean {
  return needOf(current, row) !== null;
}

export class FakeJobStore implements JobStore {
  readonly rows = new Map<string, StoredRow>();
  readonly calls = {
    findExisting: [] as string[][],
    findDedupCandidates: [] as Array<{ titles: string[]; companies: string[] }>,
    findDedupKeys: [] as number[][],
    findWriteNeeds: [] as string[][],
    refreshLastSeen: [] as string[][],
    findCoordsForLocations: [] as string[][],
    loadStoredCoords: [] as number[],
    upsertBatch: [] as JobRow[][],
    findStaleSources: [] as Array<{ before: Date; limit: number }>,
  };
  /** Make the next N `findWriteNeeds` calls throw. */
  failWriteNeeds = 0;
  /** Make the next N `refreshLastSeen` calls throw. */
  failRefreshes = 0;
  /** Make `loadStoredCoords` answer null (more stored locations than the limit). */
  tooManyStoredLocations = false;
  /** Make the next N `upsertBatch` calls with more than one row throw. */
  failBulkUpserts = 0;
  /** External ids whose single-row upsert always throws. */
  readonly poisonIds = new Set<string>();
  /** Make every call throw (database down). */
  down = false;
  private nextId = 1;

  resetCalls(): void {
    for (const list of Object.values(this.calls)) list.length = 0;
  }

  seed(row: Partial<StoredRow> & Pick<JobRow, "externalId" | "site" | "title">): StoredRow {
    const stored = { rawData: {}, ...row, id: row.id ?? this.nextId++ } as StoredRow;
    this.nextId = Math.max(this.nextId, stored.id + 1);
    this.rows.set(stored.externalId, stored);
    return stored;
  }

  async findExisting(externalIds: string[]): Promise<Map<string, ExistingJobRef>> {
    this.calls.findExisting.push([...externalIds]);
    if (this.down) throw new Error("connection refused");
    const out = new Map<string, ExistingJobRef>();
    for (const id of externalIds) {
      const r = this.rows.get(id);
      if (!r) continue;
      out.set(id, {
        externalId: id,
        hasCoords: r.latitude != null && r.longitude != null,
        locationKey: locationKey({
          city: r.locationCity,
          state: r.locationState,
          country: r.locationCountry,
        }),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt : null,
      });
    }
    return out;
  }

  async findDedupCandidates(query: { titles: string[]; companies: string[] }): Promise<DedupCandidateRef[]> {
    this.calls.findDedupCandidates.push({ titles: [...query.titles], companies: [...query.companies] });
    if (this.down) throw new Error("connection refused");
    return [...this.rows.values()]
      .filter(
        (r) =>
          query.titles.includes(r.title) ||
          (r.companyName != null && query.companies.includes(r.companyName)),
      )
      .map((r) => ({ id: r.id, externalId: r.externalId, title: r.title, companyName: r.companyName ?? null }));
  }

  async findDedupKeys(ids: number[]): Promise<DedupCandidate[]> {
    this.calls.findDedupKeys.push([...ids]);
    if (this.down) throw new Error("connection refused");
    return [...this.rows.values()]
      .filter((r) => ids.includes(r.id) && typeof rawField(r, "dedupKey") === "string")
      .sort((a, b) => a.id - b.id)
      .map((r) => ({
        id: r.id,
        externalId: r.externalId,
        site: r.site,
        sourceId: typeof rawField(r, "id") === "string" ? (rawField(r, "id") as string) : null,
        dedupKey: rawField(r, "dedupKey") as string,
      }));
  }

  async findWriteNeeds(rows: JobRow[]): Promise<Map<string, WriteNeed>> {
    this.calls.findWriteNeeds.push(rows.map((r) => r.externalId));
    if (this.down) throw new Error("connection refused");
    if (this.failWriteNeeds > 0) {
      this.failWriteNeeds--;
      throw new Error("canceling statement due to statement timeout");
    }
    const out = new Map<string, WriteNeed>();
    for (const row of rows) {
      const current = this.rows.get(row.externalId);
      // A row deleted since the existence lookup is written again (the query's LEFT JOIN).
      const need = current ? needOf(current, row) : "write";
      if (need) out.set(row.externalId, need);
    }
    return out;
  }

  async refreshLastSeen(externalIds: string[], seenAt: Date): Promise<string[]> {
    this.calls.refreshLastSeen.push([...externalIds]);
    if (this.down) throw new Error("connection refused");
    if (this.failRefreshes > 0) {
      this.failRefreshes--;
      throw new Error("canceling statement due to statement timeout");
    }
    const refreshed: string[] = [];
    for (const id of externalIds) {
      const current = this.rows.get(id);
      if (!current || !isStale(current.updatedAt, seenAt)) continue;
      current.updatedAt = seenAt;
      refreshed.push(id);
    }
    return refreshed;
  }

  async loadStoredCoords(limit: number): Promise<Map<string, Coords> | null> {
    this.calls.loadStoredCoords.push(limit);
    if (this.down) throw new Error("connection refused");
    if (this.tooManyStoredLocations) return null;
    const out = new Map<string, Coords>();
    for (const r of this.rows.values()) {
      if (r.latitude == null || r.longitude == null) continue;
      const key = locationKey({ city: r.locationCity, state: r.locationState, country: r.locationCountry });
      if (key && !out.has(key)) out.set(key, { latitude: String(r.latitude), longitude: String(r.longitude) });
    }
    return out.size > limit ? null : out;
  }

  async findCoordsForLocations(keys: string[]): Promise<Map<string, Coords>> {
    this.calls.findCoordsForLocations.push([...keys]);
    if (this.down) throw new Error("connection refused");
    const out = new Map<string, Coords>();
    for (const r of this.rows.values()) {
      if (r.latitude == null || r.longitude == null) continue;
      const key = locationKey({ city: r.locationCity, state: r.locationState, country: r.locationCountry });
      if (key && keys.includes(key) && !out.has(key)) {
        out.set(key, { latitude: String(r.latitude), longitude: String(r.longitude) });
      }
    }
    return out;
  }

  async findStaleSources(before: Date, limit: number): Promise<StaleSource[]> {
    this.calls.findStaleSources.push({ before, limit });
    if (this.down) throw new Error("connection refused");
    const bySite = new Map<string, { newest: number; rows: number }>();
    for (const r of this.rows.values()) {
      if (!(r.updatedAt instanceof Date)) continue; // NOT NULL in the table
      const site = r.site.trim().toLowerCase();
      const entry = bySite.get(site) ?? { newest: Number.NEGATIVE_INFINITY, rows: 0 };
      entry.newest = Math.max(entry.newest, r.updatedAt.getTime());
      entry.rows++;
      bySite.set(site, entry);
    }
    return [...bySite]
      .filter(([, e]) => e.newest < before.getTime())
      .sort((a, b) => a[1].newest - b[1].newest)
      .slice(0, limit)
      .map(([site, e]) => ({ site, lastSeen: new Date(e.newest).toISOString().replace(/\.\d{3}Z$/, "Z"), rows: e.rows }));
  }

  async upsertBatch(rows: JobRow[]): Promise<WrittenRow[]> {
    this.calls.upsertBatch.push(rows.map((r) => ({ ...r })));
    if (this.down) throw new Error("connection refused");
    if (rows.length > MAX_UPSERT_ROWS_PER_STATEMENT) {
      throw new RangeError(`upsertBatch got ${rows.length} rows; at most ${MAX_UPSERT_ROWS_PER_STATEMENT} fit one bounded jobs INSERT`);
    }
    if (rows.length > 1 && this.failBulkUpserts > 0) {
      this.failBulkUpserts--;
      throw new Error("bulk statement failed");
    }
    const ids = rows.map((r) => r.externalId);
    if (new Set(ids).size !== ids.length) {
      throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time");
    }
    if (rows.some((r) => this.poisonIds.has(r.externalId))) {
      throw new Error("value rejected by the database");
    }
    const written: WrittenRow[] = [];
    for (const row of rows) {
      const current = this.rows.get(row.externalId);
      if (!current) {
        this.rows.set(row.externalId, { ...row, id: this.nextId++ });
        written.push({ externalId: row.externalId, inserted: true });
        continue;
      }
      if (!shouldRewrite(current, row)) continue;
      this.rows.set(row.externalId, {
        ...current,
        ...row,
        ...effectiveSignals(current, row),
        id: current.id,
        latitude: row.latitude ?? current.latitude,
        longitude: row.longitude ?? current.longitude,
      });
      written.push({ externalId: row.externalId, inserted: false });
    }
    return written;
  }
}
