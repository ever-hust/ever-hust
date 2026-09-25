import { errorText } from "./errors";

/**
 * Geocoding for the job sync (spec 01a FR-8).
 *
 * Resolution order for a location, cheapest first:
 *   1. the run memo (a location already resolved earlier in this run),
 *   2. the process memo ({@link GeocodeMemo}, shared by every run of this process for a TTL):
 *      coordinates, "unresolvable" (Google said ZERO_RESULTS / failed — not retried until the TTL
 *      ends) and "no stored coordinates" (skip the stored-coordinate query, go to Google),
 *   3. coordinates already stored in `jobs` for the same normalised location (one batched query
 *      per ingest batch, via {@link CoordsLookup}; after {@link STORED_LOOKUPS_BEFORE_PRELOAD} of
 *      those, one load of every stored location for the rest of the run),
 *   4. Google's Geocoding API — sequentially, at most `maxCalls` per run, and never again in the
 *      run once Google answered `OVER_QUERY_LIMIT` (quota) or `REQUEST_DENIED` (unusable key); the
 *      process memo then keeps Google off for every run for a while too.
 */

export interface LocationParts {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface Coords {
  latitude: string;
  longitude: string;
}

export type GeocodeOutcome =
  | { status: "ok"; coords: Coords }
  | { status: "zero_results" }
  | { status: "quota" }
  | { status: "denied" }
  | { status: "error"; message: string };

export type GeocodeFn = (address: string) => Promise<GeocodeOutcome>;

export interface CoordsLookup {
  /** Stored coordinates for normalised location keys (see {@link locationKey}); missing keys are absent. */
  findCoordsForLocations(keys: string[]): Promise<Map<string, Coords>>;
  /**
   * Every stored location's coordinates in one read, or `null` when there are more than `limit`
   * of them (spec 01a D26). Optional: without it every batch uses {@link findCoordsForLocations}.
   */
  loadStoredCoords?(limit: number): Promise<Map<string, Coords> | null>;
}

/**
 * Per-batch stored-coordinate lookups a run makes before it loads every stored location once
 * instead (spec 01a D26). Each lookup scans `jobs` (no index covers the computed location key), so
 * a keyword run (a few batches) keeps its targeted lookups, and a full run (hundreds of batches)
 * pays two of them plus one load instead of one scan per batch.
 */
export const STORED_LOOKUPS_BEFORE_PRELOAD = 2;

/**
 * Most stored locations a run loads at once (≈ 10 MB of memo at the worst); with more, the run
 * stays with per-batch lookups.
 */
export const STORED_COORDS_PRELOAD_LIMIT = 50_000;

export type GeocoderStopReason = "quota" | "denied" | "cap" | "disabled";

export interface GeocoderLogger {
  warn(message: string): void;
}

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/**
 * Normalised `city|state|country` key (trimmed, lower-cased) — the SQL side uses the same
 * `lower(btrim(coalesce(col, '')))` expression. `null` when all three parts are empty.
 */
export function locationKey(parts: LocationParts): string | null {
  const city = norm(parts.city);
  const state = norm(parts.state);
  const country = norm(parts.country);
  if (!city && !state && !country) return null;
  return `${city}|${state}|${country}`;
}

/** Human-readable address for Google, in the order Google expects. */
export function geocodeAddress(parts: LocationParts): string {
  return [parts.city, parts.state, parts.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** One Google Geocoding request, mapped to a {@link GeocodeOutcome}. Never throws. */
export function googleGeocoder(
  apiKey: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): GeocodeFn {
  return async (address) => {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", address);
      url.searchParams.set("key", apiKey);
      const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return res.status === 429
          ? { status: "quota" }
          : { status: "error", message: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        status?: string;
        error_message?: string;
        results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
      };
      switch (data.status) {
        case "OK": {
          const loc = data.results?.[0]?.geometry?.location;
          if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
            return { status: "ok", coords: { latitude: String(loc.lat), longitude: String(loc.lng) } };
          }
          return { status: "zero_results" };
        }
        case "ZERO_RESULTS":
          return { status: "zero_results" };
        case "OVER_QUERY_LIMIT":
        case "OVER_DAILY_LIMIT":
          return { status: "quota" };
        case "REQUEST_DENIED":
          return { status: "denied" };
        default:
          return {
            status: "error",
            message: `${data.status ?? "unknown status"}${data.error_message ? `: ${data.error_message}` : ""}`,
          };
      }
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  };
}

/** Google geocoder from `GOOGLE_MAPS_SERVER_KEY`, or `null` when no key is configured. */
export function googleGeocoderFromEnv(env: Record<string, string | undefined> = process.env): GeocodeFn | null {
  // Server key ONLY — never a NEXT_PUBLIC_* key (see apps/web/lib/maps-key.ts).
  const key = env.GOOGLE_MAPS_SERVER_KEY?.trim();
  return key ? googleGeocoder(key) : null;
}

export interface GeocodeRequest {
  key: string;
  parts: LocationParts;
}

export interface GeocodeMemoOptions {
  /** Entries kept (oldest evicted first). Default 20 000. */
  maxEntries?: number;
  /** Resolved coordinates. Default 24 h. */
  coordsTtlMs?: number;
  /** Google answered ZERO_RESULTS. Default 24 h. */
  unresolvableTtlMs?: number;
  /** A Google call failed (transient). Default 1 h. */
  errorTtlMs?: number;
  /** No coordinates stored in `jobs` for the location. Default 6 h. */
  storedMissTtlMs?: number;
  /** Google is left alone after OVER_QUERY_LIMIT / REQUEST_DENIED. Default 1 h. */
  blockMs?: number;
  now?: () => number;
}

export type GeocodeMemoEntry =
  | { kind: "coords"; coords: Coords }
  | { kind: "unresolvable" }
  | { kind: "storedMiss" };

const HOUR_MS = 60 * 60 * 1000;

/**
 * Process-level geocoding memo with TTLs, shared by every sync run of the process (the web pod).
 * Without it a location Google could not resolve, or one no stored row has coordinates for, was
 * looked up in the database and sent to Google again on every 15-minute run (review of
 * 2026-09-25); with it, repeated locations cost neither the stored-coordinate query (a sequential
 * scan: there is no index on the computed location key, spec D1) nor a Google call.
 */
export class GeocodeMemo {
  private readonly entries = new Map<string, { entry: GeocodeMemoEntry; expires: number }>();
  private blockedUntil = 0;
  private blockedReason: "quota" | "denied" | null = null;
  private readonly opts: Required<Omit<GeocodeMemoOptions, "now">>;
  private readonly now: () => number;

  constructor(options: GeocodeMemoOptions = {}) {
    this.opts = {
      maxEntries: options.maxEntries ?? 20_000,
      coordsTtlMs: options.coordsTtlMs ?? 24 * HOUR_MS,
      unresolvableTtlMs: options.unresolvableTtlMs ?? 24 * HOUR_MS,
      errorTtlMs: options.errorTtlMs ?? HOUR_MS,
      storedMissTtlMs: options.storedMissTtlMs ?? 6 * HOUR_MS,
      blockMs: options.blockMs ?? HOUR_MS,
    };
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): GeocodeMemoEntry | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.entry;
  }

  setCoords(key: string, coords: Coords): void {
    this.set(key, { kind: "coords", coords }, this.opts.coordsTtlMs);
  }

  /** Google could not resolve the location; `transient` = a failed call rather than ZERO_RESULTS. */
  setUnresolvable(key: string, transient = false): void {
    this.set(key, { kind: "unresolvable" }, transient ? this.opts.errorTtlMs : this.opts.unresolvableTtlMs);
  }

  /** No stored coordinates for the location (skip the stored query next time; Google may still run). */
  setStoredMiss(key: string): void {
    const current = this.get(key);
    if (current && current.kind !== "storedMiss") return; // never downgrade a verdict
    this.set(key, { kind: "storedMiss" }, this.opts.storedMissTtlMs);
  }

  /** Keep Google off for every run of this process for a while (quota / unusable key). */
  blockGoogle(reason: "quota" | "denied"): void {
    this.blockedUntil = this.now() + this.opts.blockMs;
    this.blockedReason = reason;
  }

  /** The reason Google is currently off for this process, or null. */
  googleBlocked(): "quota" | "denied" | null {
    return this.blockedUntil > this.now() ? this.blockedReason : null;
  }

  private set(key: string, entry: GeocodeMemoEntry, ttlMs: number): void {
    this.entries.delete(key); // re-insert: Map order is the eviction order
    this.entries.set(key, { entry, expires: this.now() + ttlMs });
    while (this.entries.size > this.opts.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** The memo shared by every sync run of this process (production wiring). */
export const processGeocodeMemo = new GeocodeMemo();

export class RunGeocoder {
  /** Google requests made this run. */
  calls = 0;
  /** Requests (rows) that got coordinates without their own Google call (memo or stored). */
  reused = 0;
  stoppedReason: GeocoderStopReason | null;

  private readonly memo = new Map<string, Coords | null>();
  /** Per-batch stored-coordinate lookups made so far. */
  private storedLookups = 0;
  /** Every stored location's coordinates, once loaded (spec D26). */
  private preloaded: Map<string, Coords> | null = null;
  /** The load was tried and failed or was too large: stay with per-batch lookups. */
  private preloadGaveUp = false;

  constructor(
    private readonly deps: {
      lookup: CoordsLookup;
      geocode: GeocodeFn | null;
      maxCalls: number;
      logger?: GeocoderLogger;
      /** Cross-run memo (default: none — the run memo only). */
      shared?: GeocodeMemo;
      /** Default {@link STORED_LOOKUPS_BEFORE_PRELOAD}. */
      storedLookupsBeforePreload?: number;
      /** Default {@link STORED_COORDS_PRELOAD_LIMIT}. */
      preloadLimit?: number;
    },
  ) {
    this.stoppedReason = deps.geocode ? (deps.maxCalls > 0 ? null : "cap") : "disabled";
    const blocked = this.stoppedReason === null ? deps.shared?.googleBlocked() : null;
    if (blocked) {
      this.stoppedReason = blocked;
      deps.logger?.warn(
        `[jobs-sync] Google geocoding is paused for this process (${blocked === "quota" ? "OVER_QUERY_LIMIT" : "REQUEST_DENIED"} earlier); stored coordinates only this run`,
      );
    }
  }

  /**
   * Resolve coordinates for a batch of requests (one per row; keys may repeat). Returns a map
   * key → coordinates (or null when the location could not be resolved this run).
   */
  async resolve(requests: GeocodeRequest[]): Promise<Map<string, Coords | null>> {
    const result = new Map<string, Coords | null>();
    if (requests.length === 0) return result;

    const firstParts = new Map<string, LocationParts>();
    for (const r of requests) if (!firstParts.has(r.key)) firstParts.set(r.key, r.parts);

    const { shared } = this.deps;

    // 1) Run memo, then the process memo.
    const unresolved: string[] = [];
    const toLookUp: string[] = [];
    for (const key of firstParts.keys()) {
      if (this.memo.has(key)) {
        result.set(key, this.memo.get(key) ?? null);
        continue;
      }
      const hit = shared?.get(key);
      if (hit?.kind === "coords") {
        this.memo.set(key, hit.coords);
        result.set(key, hit.coords);
        continue;
      }
      if (hit?.kind === "unresolvable") {
        this.memo.set(key, null);
        result.set(key, null);
        continue;
      }
      unresolved.push(key);
      if (hit?.kind !== "storedMiss") toLookUp.push(key);
    }

    // 2) Stored coordinates for the same location — one query for the whole batch.
    if (toLookUp.length > 0) {
      const stored = await this.storedCoords(toLookUp);
      for (const key of toLookUp) {
        const coords = stored?.get(key);
        if (coords) {
          this.memo.set(key, coords);
          shared?.setCoords(key, coords);
          result.set(key, coords);
        } else if (stored) {
          shared?.setStoredMiss(key); // (a failed query proves nothing)
        }
      }
    }

    // 3) Google, sequentially, for what is still unresolved.
    const calledNow = new Set<string>();
    for (const key of unresolved) {
      if (result.has(key)) continue;
      if (this.stoppedReason === null && this.calls >= this.deps.maxCalls) {
        this.stop("cap", `per-run cap of ${this.deps.maxCalls} Google calls reached`);
      }
      if (this.stoppedReason !== null) {
        // Stored coordinates were already checked above and Google is off-limits for the rest of
        // the run, so remember the miss: later batches skip both the query and the call.
        this.memo.set(key, null);
        result.set(key, null);
        continue;
      }
      const outcome = await this.deps.geocode!(geocodeAddress(firstParts.get(key)!));
      this.calls++;
      calledNow.add(key);
      switch (outcome.status) {
        case "ok":
          this.memo.set(key, outcome.coords);
          shared?.setCoords(key, outcome.coords);
          result.set(key, outcome.coords);
          break;
        case "zero_results":
          this.memo.set(key, null);
          shared?.setUnresolvable(key);
          result.set(key, null);
          break;
        case "quota":
          this.memo.set(key, null);
          result.set(key, null);
          shared?.blockGoogle("quota");
          this.stop("quota", "Google answered OVER_QUERY_LIMIT");
          break;
        case "denied":
          this.memo.set(key, null);
          result.set(key, null);
          shared?.blockGoogle("denied");
          this.stop("denied", "Google answered REQUEST_DENIED");
          break;
        case "error":
          // Transient: not retried in this run, nor by this process for a short while.
          this.memo.set(key, null);
          shared?.setUnresolvable(key, true);
          result.set(key, null);
          this.deps.logger?.warn(`[jobs-sync] geocode failed: ${outcome.message}`);
          break;
      }
    }

    // Reuse accounting, per row: the first row of a key resolved by a Google call made now
    // "owns" that call; every other row that got coordinates was served without a call.
    const ownerSeen = new Set<string>();
    for (const r of requests) {
      const coords = result.get(r.key);
      if (!coords) continue;
      if (calledNow.has(r.key) && !ownerSeen.has(r.key)) {
        ownerSeen.add(r.key);
        continue;
      }
      this.reused++;
    }
    return result;
  }

  /**
   * Stored coordinates for `keys`, or `null` when the lookup failed (which proves nothing about the
   * keys). The first {@link STORED_LOOKUPS_BEFORE_PRELOAD} calls of a run query just those keys;
   * after that the run loads every stored location once and answers from memory (spec D26).
   */
  private async storedCoords(keys: string[]): Promise<Map<string, Coords> | null> {
    const { lookup, logger } = this.deps;
    const threshold = this.deps.storedLookupsBeforePreload ?? STORED_LOOKUPS_BEFORE_PRELOAD;
    if (!this.preloaded && !this.preloadGaveUp && lookup.loadStoredCoords && this.storedLookups >= threshold) {
      const limit = this.deps.preloadLimit ?? STORED_COORDS_PRELOAD_LIMIT;
      try {
        this.preloaded = await lookup.loadStoredCoords(limit);
        if (!this.preloaded) {
          this.preloadGaveUp = true;
          logger?.warn(
            `[jobs-sync] more than ${limit} stored locations to load at once; stored coordinates stay per batch this run`,
          );
        }
      } catch (err) {
        this.preloadGaveUp = true;
        logger?.warn(
          `[jobs-sync] loading stored coordinates failed (${errorText(err)}); stored coordinates stay per batch this run`,
        );
      }
    }
    if (this.preloaded) {
      const out = new Map<string, Coords>();
      for (const key of keys) {
        const coords = this.preloaded.get(key);
        if (coords) out.set(key, coords);
      }
      return out;
    }
    this.storedLookups++;
    try {
      return await lookup.findCoordsForLocations(keys);
    } catch (err) {
      logger?.warn(`[jobs-sync] stored-coordinate lookup failed: ${errorText(err)}`);
      return null;
    }
  }

  private stop(reason: GeocoderStopReason, message: string): void {
    if (this.stoppedReason !== null) return;
    this.stoppedReason = reason;
    this.deps.logger?.warn(`[jobs-sync] ${message}; no more Google geocoding this run`);
  }
}
