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
  type WrittenRow,
} from "../job-store";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory {@link JobStore} for unit tests. It mirrors the semantics of the Drizzle store:
 * `upsertBatch` rejects duplicate external ids in one statement (as Postgres does), inserts new
 * rows, rewrites an existing row only when a content column changed / coordinates or the dedup
 * identity get backfilled or its last-seen marker is older than the refresh window, and keeps
 * stored coordinates when the incoming row has none. A merge row (`rawData.id` ≠ `externalId`)
 * only rewrites an owner older than the takeover window.
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

/** Mirrors `upsertChangedPredicate()`. */
function shouldRewrite(current: StoredRow, row: JobRow): boolean {
  const sourceId = rawField(row, "id");
  if (typeof sourceId === "string" && sourceId !== row.externalId) {
    // A cross-run merge row: only a stale owner is taken over.
    return mergeMayTakeOver(current.updatedAt, row.updatedAt);
  }
  const signals = effectiveSignals(current, row);
  return (
    CONTENT_KEYS.some((k) => !same(current[k], row[k])) ||
    !same(current.liveness, signals.liveness) ||
    !same(current.legitimacy, signals.legitimacy) ||
    !same(current.legitimacyReasons, signals.legitimacyReasons) ||
    (current.latitude == null && row.latitude != null) ||
    !same(rawField(current, "dedupKey"), rawField(row, "dedupKey")) ||
    !same(rawField(current, "careerLevel"), rawField(row, "careerLevel")) ||
    (current.updatedAt instanceof Date &&
      row.updatedAt instanceof Date &&
      current.updatedAt.getTime() < row.updatedAt.getTime() - LAST_SEEN_REFRESH_DAYS * DAY_MS)
  );
}

export class FakeJobStore implements JobStore {
  readonly rows = new Map<string, StoredRow>();
  readonly calls = {
    findExisting: [] as string[][],
    findDedupCandidates: [] as Array<{ titles: string[]; companies: string[] }>,
    findDedupKeys: [] as number[][],
    findCoordsForLocations: [] as string[][],
    upsertBatch: [] as JobRow[][],
  };
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
      .map((r) => ({ id: r.id, externalId: r.externalId, dedupKey: rawField(r, "dedupKey") as string }));
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
