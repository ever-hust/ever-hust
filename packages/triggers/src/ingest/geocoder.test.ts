import { describe, it, expect, jest } from "@jest/globals";
import {
  GeocodeMemo,
  geocodeAddress,
  googleGeocoder,
  googleGeocoderFromEnv,
  locationKey,
  RunGeocoder,
  type CoordsLookup,
  type GeocodeFn,
  type Coords,
} from "./geocoder";

const silent = { warn: () => {} };

function lookupOf(stored: Record<string, Coords> = {}) {
  const fn = jest.fn(async (keys: string[]) => {
    const out = new Map<string, Coords>();
    for (const k of keys) if (stored[k]) out.set(k, stored[k]!);
    return out;
  });
  const lookup: CoordsLookup = { findCoordsForLocations: fn };
  return { lookup, fn };
}

const ok = (address: string) => ({
  status: "ok" as const,
  coords: { latitude: `lat:${address}`, longitude: `lng:${address}` },
});

describe("locationKey / geocodeAddress", () => {
  it("normalises case and whitespace, and is null for an empty location", () => {
    expect(locationKey({ city: " Austin ", state: "TX", country: "usa" })).toBe("austin|tx|usa");
    expect(locationKey({ city: "AUSTIN", state: " tx", country: "USA " })).toBe("austin|tx|usa");
    expect(locationKey({ city: null, state: "", country: undefined })).toBeNull();
    expect(locationKey({ country: "Germany" })).toBe("||germany");
  });

  it("builds the Google address from the non-empty parts", () => {
    expect(geocodeAddress({ city: "Austin", state: null, country: "USA" })).toBe("Austin, USA");
  });
});

describe("RunGeocoder", () => {
  it("resolves memo → stored → Google, with one stored lookup per batch", async () => {
    const { lookup, fn } = lookupOf({ "berlin||de": { latitude: "52.5", longitude: "13.4" } });
    const geocode = jest.fn<GeocodeFn>(async (a) => ok(a));
    const g = new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: silent });

    const first = await g.resolve([
      { key: "berlin||de", parts: { city: "Berlin", country: "DE" } },
      { key: "paris||fr", parts: { city: "Paris", country: "FR" } },
      { key: "paris||fr", parts: { city: "Paris", country: "FR" } },
    ]);
    expect(first.get("berlin||de")).toEqual({ latitude: "52.5", longitude: "13.4" });
    expect(first.get("paris||fr")).toEqual(ok("Paris, FR").coords);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(["berlin||de", "paris||fr"]);
    expect(geocode).toHaveBeenCalledTimes(1);
    // berlin (stored) + the second paris row (served by the first row's call)
    expect(g.calls).toBe(1);
    expect(g.reused).toBe(2);

    // Second batch: everything memoised → no query, no call.
    await g.resolve([{ key: "paris||fr", parts: { city: "Paris", country: "FR" } }]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(g.reused).toBe(3);
  });

  it("stops Google for the rest of the run after OVER_QUERY_LIMIT", async () => {
    const { lookup } = lookupOf();
    const geocode = jest.fn<GeocodeFn>(async () => ({ status: "quota" as const }));
    const warn = jest.fn();
    const g = new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: { warn } });
    const out = await g.resolve([
      { key: "a", parts: { city: "A" } },
      { key: "b", parts: { city: "B" } },
    ]);
    await g.resolve([{ key: "c", parts: { city: "C" } }]);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(g.stoppedReason).toBe("quota");
    expect(out.get("a")).toBeNull();
    expect(out.get("b")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("also stops after REQUEST_DENIED (the key is unusable)", async () => {
    const geocode = jest.fn<GeocodeFn>(async () => ({ status: "denied" as const }));
    const g = new RunGeocoder({ lookup: lookupOf().lookup, geocode, maxCalls: 10, logger: silent });
    await g.resolve([
      { key: "a", parts: { city: "A" } },
      { key: "b", parts: { city: "B" } },
    ]);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(g.stoppedReason).toBe("denied");
  });

  it("enforces the per-run call cap", async () => {
    const geocode = jest.fn<GeocodeFn>(async (a) => ok(a));
    const g = new RunGeocoder({ lookup: lookupOf().lookup, geocode, maxCalls: 2, logger: silent });
    await g.resolve(["a", "b", "c", "d"].map((k) => ({ key: k, parts: { city: k } })));
    expect(geocode).toHaveBeenCalledTimes(2);
    expect(g.stoppedReason).toBe("cap");
  });

  it("is disabled without a geocode function, but still reuses stored coordinates", async () => {
    const { lookup } = lookupOf({ a: { latitude: "1", longitude: "2" } });
    const g = new RunGeocoder({ lookup, geocode: null, maxCalls: 10, logger: silent });
    const out = await g.resolve([
      { key: "a", parts: { city: "A" } },
      { key: "b", parts: { city: "B" } },
    ]);
    expect(g.stoppedReason).toBe("disabled");
    expect(out.get("a")).toEqual({ latitude: "1", longitude: "2" });
    expect(out.get("b")).toBeNull();
  });

  it("memoises transient Google errors for the run", async () => {
    const lookup: CoordsLookup = { findCoordsForLocations: async () => new Map() };
    const geocode = jest.fn<GeocodeFn>(async () => ({ status: "error" as const, message: "timeout" }));
    const g = new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: silent });
    await g.resolve([{ key: "a", parts: { city: "A" } }]);
    await g.resolve([{ key: "a", parts: { city: "A" } }]);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(g.stoppedReason).toBeNull();
  });

  it("does not send the keys of a failed stored-coordinate lookup to Google; a later lookup retries them (review F6)", async () => {
    let fail = true;
    const lookup: CoordsLookup = {
      findCoordsForLocations: async (keys) => {
        if (fail) throw new Error("canceling statement due to statement timeout");
        return new Map(keys.map((k) => [k, { latitude: "1", longitude: "2" }]));
      },
    };
    const geocode = jest.fn<GeocodeFn>(async () => ({ status: "ok" as const, coords: { latitude: "9", longitude: "9" } }));
    const g = new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: silent });
    const first = await g.resolve([
      { key: "a", parts: { city: "A" } },
      { key: "b", parts: { city: "B" } },
    ]);
    expect(first.get("a")).toBeNull();
    expect(first.get("b")).toBeNull();
    expect(geocode).not.toHaveBeenCalled();
    expect(g.calls).toBe(0);

    fail = false;
    const second = await g.resolve([{ key: "a", parts: { city: "A" } }]);
    expect(second.get("a")).toEqual({ latitude: "1", longitude: "2" });
    expect(geocode).not.toHaveBeenCalled();
  });
});

describe("RunGeocoder + GeocodeMemo (across runs of one process)", () => {
  function clock(start = 1_000_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }
  const HOUR = 60 * 60 * 1000;

  it("serves coordinates and Google's ZERO_RESULTS from the process memo on the next run: no query, no call", async () => {
    const c = clock();
    const shared = new GeocodeMemo({ now: c.now });
    const { lookup, fn } = lookupOf();
    const geocode = jest.fn<GeocodeFn>(async (a) => (a === "Nowhere" ? { status: "zero_results" as const } : ok(a)));
    const reqs = [
      { key: "paris||fr", parts: { city: "Paris", country: "FR" } },
      { key: "nowhere||", parts: { city: "Nowhere" } },
    ];

    await new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: silent, shared }).resolve(reqs);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledTimes(2);

    const run2 = new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: silent, shared });
    const out = await run2.resolve(reqs);
    expect(fn).toHaveBeenCalledTimes(1); // no stored-coordinate query (it is a sequential scan)
    expect(geocode).toHaveBeenCalledTimes(2); // and no new Google call, not even for the failure
    expect(out.get("paris||fr")).toEqual(ok("Paris, FR").coords);
    expect(out.get("nowhere||")).toBeNull();
    expect(run2.calls).toBe(0);
    expect(run2.reused).toBe(1);

    // ZERO_RESULTS is retried once its TTL (24 h) is over.
    c.advance(25 * HOUR);
    await new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: silent, shared }).resolve([reqs[1]!]);
    expect(geocode).toHaveBeenCalledTimes(3);
  });

  it("remembers a location with no stored coordinates: later runs skip the query but may still call Google", async () => {
    const shared = new GeocodeMemo();
    const { lookup, fn } = lookupOf();
    const capped = jest.fn<GeocodeFn>(async (a) => ok(a));
    // Run 1: Google capped at 0 → the location stays unresolved, but the stored miss is remembered.
    await new RunGeocoder({ lookup, geocode: capped, maxCalls: 0, logger: silent, shared }).resolve([
      { key: "a", parts: { city: "A" } },
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shared.get("a")).toEqual({ kind: "storedMiss" });

    // Run 2: budget available → straight to Google, no second query.
    const out = await new RunGeocoder({ lookup, geocode: capped, maxCalls: 5, logger: silent, shared }).resolve([
      { key: "a", parts: { city: "A" } },
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(capped).toHaveBeenCalledTimes(1);
    expect(out.get("a")).toEqual(ok("A").coords);
    expect(shared.get("a")).toEqual({ kind: "coords", coords: ok("A").coords });
  });

  it("retries a transient Google error only after its short TTL", async () => {
    const c = clock();
    const shared = new GeocodeMemo({ now: c.now });
    const geocode = jest.fn<GeocodeFn>(async () => ({ status: "error" as const, message: "timeout" }));
    const run = () =>
      new RunGeocoder({ lookup: lookupOf().lookup, geocode, maxCalls: 5, logger: silent, shared }).resolve([
        { key: "a", parts: { city: "A" } },
      ]);
    await run();
    await run();
    expect(geocode).toHaveBeenCalledTimes(1);
    c.advance(2 * HOUR);
    await run();
    expect(geocode).toHaveBeenCalledTimes(2);
  });

  it("keeps Google off for the whole process for a while after OVER_QUERY_LIMIT", async () => {
    const c = clock();
    const shared = new GeocodeMemo({ now: c.now });
    const quota = jest.fn<GeocodeFn>(async () => ({ status: "quota" as const }));
    await new RunGeocoder({ lookup: lookupOf().lookup, geocode: quota, maxCalls: 5, logger: silent, shared }).resolve([
      { key: "a", parts: { city: "A" } },
    ]);
    const warn = jest.fn();
    const next = new RunGeocoder({ lookup: lookupOf().lookup, geocode: quota, maxCalls: 5, logger: { warn }, shared });
    expect(next.stoppedReason).toBe("quota");
    await next.resolve([{ key: "b", parts: { city: "B" } }]);
    expect(quota).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("paused"));

    c.advance(2 * HOUR);
    expect(new RunGeocoder({ lookup: lookupOf().lookup, geocode: quota, maxCalls: 5, logger: silent, shared }).stoppedReason).toBeNull();
  });

  it("does not record a stored miss when the stored-coordinate query failed", async () => {
    const shared = new GeocodeMemo();
    const lookup: CoordsLookup = {
      findCoordsForLocations: async () => {
        throw new Error("db down");
      },
    };
    await new RunGeocoder({ lookup, geocode: null, maxCalls: 0, logger: silent, shared }).resolve([
      { key: "a", parts: { city: "A" } },
    ]);
    expect(shared.get("a")).toBeUndefined();
  });

  it("is bounded: the oldest entries are evicted first", () => {
    const shared = new GeocodeMemo({ maxEntries: 2 });
    shared.setCoords("a", { latitude: "1", longitude: "1" });
    shared.setUnresolvable("b");
    shared.setStoredMiss("c");
    expect(shared.size).toBe(2);
    expect(shared.get("a")).toBeUndefined();
    expect(shared.get("b")).toEqual({ kind: "unresolvable" });
    // A stored miss never overwrites a verdict.
    shared.setStoredMiss("b");
    expect(shared.get("b")).toEqual({ kind: "unresolvable" });
  });
});

describe("googleGeocoder", () => {
  function fetchReturning(body: unknown, status = 200) {
    return jest.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  }

  it("maps Google statuses to outcomes", async () => {
    const cases: Array<[unknown, string]> = [
      [{ status: "OK", results: [{ geometry: { location: { lat: 1.5, lng: -2 } } }] }, "ok"],
      [{ status: "ZERO_RESULTS", results: [] }, "zero_results"],
      [{ status: "OVER_QUERY_LIMIT" }, "quota"],
      [{ status: "REQUEST_DENIED", error_message: "key invalid" }, "denied"],
      [{ status: "INVALID_REQUEST" }, "error"],
    ];
    for (const [body, expected] of cases) {
      const outcome = await googleGeocoder("k", fetchReturning(body))("Austin, TX");
      expect(outcome.status).toBe(expected);
    }
    const okOutcome = await googleGeocoder(
      "k",
      fetchReturning({ status: "OK", results: [{ geometry: { location: { lat: 1.5, lng: -2 } } }] }),
    )("x");
    expect(okOutcome).toEqual({ status: "ok", coords: { latitude: "1.5", longitude: "-2" } });
  });

  it("treats HTTP 429 as quota and never throws on transport errors", async () => {
    expect((await googleGeocoder("k", fetchReturning({}, 429))("x")).status).toBe("quota");
    const failing = jest.fn<typeof fetch>(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await googleGeocoder("k", failing)("x")).toEqual({ status: "error", message: "ECONNRESET" });
  });

  it("sends the address and the server key", async () => {
    const f = fetchReturning({ status: "ZERO_RESULTS" });
    await googleGeocoder("server-key", f)("Austin, TX");
    const url = new URL(String(f.mock.calls[0]![0]));
    expect(url.searchParams.get("address")).toBe("Austin, TX");
    expect(url.searchParams.get("key")).toBe("server-key");
  });

  it("googleGeocoderFromEnv is null without GOOGLE_MAPS_SERVER_KEY", () => {
    expect(googleGeocoderFromEnv({})).toBeNull();
    expect(googleGeocoderFromEnv({ GOOGLE_MAPS_SERVER_KEY: "  " })).toBeNull();
    expect(typeof googleGeocoderFromEnv({ GOOGLE_MAPS_SERVER_KEY: "k" })).toBe("function");
  });
});

describe("RunGeocoder — one load of every stored location for a long run (spec D26)", () => {
  const stored: Record<string, Coords> = {
    "a||": { latitude: "1", longitude: "1" },
    "b||": { latitude: "2", longitude: "2" },
    "c||": { latitude: "3", longitude: "3" },
  };
  function preloadingLookup(answer: "all" | "too-many" | "fail" = "all") {
    const { lookup, fn } = lookupOf(stored);
    const load = jest.fn(async (limit: number) => {
      if (answer === "fail") throw new Error("canceling statement due to statement timeout");
      if (answer === "too-many") return null;
      expect(limit).toBe(50_000);
      return new Map(Object.entries(stored));
    });
    return { lookup: { ...lookup, loadStoredCoords: load } as CoordsLookup, fn, load };
  }
  const batch = (key: string) => [{ key, parts: { city: key.split("|")[0] } }];

  it("makes two targeted lookups, then loads every stored location once and answers from it", async () => {
    const { lookup, fn, load } = preloadingLookup();
    const geocode = jest.fn<GeocodeFn>(async (a) => ok(a));
    const g = new RunGeocoder({ lookup, geocode, maxCalls: 10, logger: silent });
    expect((await g.resolve(batch("a||"))).get("a||")).toEqual(stored["a||"]);
    expect((await g.resolve(batch("x||"))).get("x||")).toEqual(ok("x").coords); // stored miss → Google
    expect((await g.resolve(batch("b||"))).get("b||")).toEqual(stored["b||"]);
    expect((await g.resolve(batch("c||"))).get("c||")).toEqual(stored["c||"]);
    expect((await g.resolve(batch("y||"))).get("y||")).toEqual(ok("y").coords); // absent from the load → Google
    expect(fn).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(geocode.mock.calls.map((c) => c[0])).toEqual(["x", "y"]);
  });

  it("stays with per-batch lookups when there are too many stored locations to load, or the load failed", async () => {
    for (const answer of ["too-many", "fail"] as const) {
      const { lookup, fn, load } = preloadingLookup(answer);
      const warnings: string[] = [];
      const g = new RunGeocoder({ lookup, geocode: null, maxCalls: 0, logger: { warn: (m) => warnings.push(m) } });
      for (const key of ["a||", "b||", "c||", "d||"]) await g.resolve(batch(key));
      expect(load).toHaveBeenCalledTimes(1); // tried once, never again this run
      expect(fn).toHaveBeenCalledTimes(4);
      expect(warnings.join("\n")).toContain("stored coordinates stay per batch this run");
    }
  });

  it("never loads for a lookup without loadStoredCoords, or before the threshold", async () => {
    const { lookup, fn } = lookupOf(stored);
    const g = new RunGeocoder({ lookup, geocode: null, maxCalls: 0, logger: silent });
    for (const key of ["a||", "b||", "c||"]) await g.resolve(batch(key));
    expect(fn).toHaveBeenCalledTimes(3);
    const custom = preloadingLookup();
    const late = new RunGeocoder({ lookup: custom.lookup, geocode: null, maxCalls: 0, logger: silent, storedLookupsBeforePreload: 5 });
    for (const key of ["a||", "b||", "c||"]) await late.resolve(batch(key));
    expect(custom.load).not.toHaveBeenCalled();
  });
});
