import { describe, it, expect, jest } from "@jest/globals";
import type { JobPostDto } from "@ever-hust/jobs-api";
import { RunGeocoder, type GeocodeFn } from "./geocoder";
import {
  fallbackDedupIdentity,
  IngestAbortedError,
  JobIngestor,
  looseIdentity,
  type IngestCounters,
} from "./ingestor";
import { MAX_UPSERT_ROWS_PER_STATEMENT } from "./job-store";
import { FakeJobStore } from "./testing/fake-store";

const silent = { info: () => {}, warn: () => {}, error: () => {} };

function job(id: string, extra: Partial<JobPostDto> = {}): JobPostDto {
  return {
    id,
    site: "greenhouse",
    title: `Engineer ${id}`,
    companyName: "Acme",
    location: { city: "Austin", state: "TX", country: "USA" },
    ...extra,
  };
}

function setup(
  opts: {
    store?: FakeJobStore;
    batchSize?: number;
    geocode?: GeocodeFn | null;
    maxCalls?: number;
    maxConsecutiveFailedBatches?: number;
  } = {},
) {
  const store = opts.store ?? new FakeJobStore();
  const geocode =
    opts.geocode === undefined
      ? jest.fn<GeocodeFn>(async (address) => ({
          status: "ok" as const,
          coords: { latitude: `lat:${address}`, longitude: `lng:${address}` },
        }))
      : opts.geocode;
  const geocoder = new RunGeocoder({
    lookup: store,
    geocode,
    maxCalls: opts.maxCalls ?? 100,
    logger: silent,
  });
  const ingestor = new JobIngestor({
    store,
    geocoder,
    batchSize: opts.batchSize ?? 3,
    logger: silent,
    maxConsecutiveFailedBatches: opts.maxConsecutiveFailedBatches,
  });
  return { store, geocoder, geocode, ingestor };
}

async function ingestAll(ingestor: JobIngestor, jobs: JobPostDto[]) {
  for (const j of jobs) await ingestor.add(j);
  await ingestor.flush();
  return ingestor.counters;
}

/** Every received job lands in exactly one bucket. */
function expectInvariant(c: IngestCounters) {
  expect(c.inserted + c.updated + c.unchanged + c.invalid + c.duplicatesMerged + c.errors).toBe(
    c.received,
  );
}

describe("JobIngestor — batching", () => {
  it("writes one bulk statement per batch, with bounded batch size and sorted keys", async () => {
    const { store, ingestor } = setup({ batchSize: 3 });
    const counters = await ingestAll(ingestor, ["g", "a", "f", "b", "e", "c", "d"].map((id) => job(id)));

    expect(store.calls.upsertBatch.map((b) => b.length)).toEqual([3, 3, 1]);
    expect(store.calls.upsertBatch[0]!.map((r) => r.externalId)).toEqual(["a", "f", "g"]);
    expect(counters).toMatchObject({ received: 7, inserted: 7, updated: 0, unchanged: 0 });
    expect(store.rows.size).toBe(7);
    expectInvariant(counters);
  });

  it("never builds a batch larger than one bounded jobs INSERT may hold", async () => {
    const { store, ingestor } = setup({ batchSize: 10_000 });
    const jobs = Array.from({ length: MAX_UPSERT_ROWS_PER_STATEMENT + 1 }, (_, i) => job(String(i).padStart(4, "0")));
    const counters = await ingestAll(ingestor, jobs);
    expect(store.calls.upsertBatch.map((b) => b.length)).toEqual([MAX_UPSERT_ROWS_PER_STATEMENT, 1]);
    expect(counters).toMatchObject({ received: MAX_UPSERT_ROWS_PER_STATEMENT + 1, inserted: MAX_UPSERT_ROWS_PER_STATEMENT + 1 });
  });

  it("does not rewrite unchanged rows on a second run, and counts real changes as updates", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [job("1"), job("2"), job("3")]);

    const second = setup({ store });
    const counters = await ingestAll(second.ingestor, [
      job("1"),
      job("2", { title: "Senior Engineer 2" }),
      job("3"),
    ]);
    expect(counters).toMatchObject({ received: 3, inserted: 0, updated: 1, unchanged: 2 });
    expect(store.rows.get("2")!.title).toBe("Senior Engineer 2");
    expectInvariant(counters);
  });

  it("refreshes the last-seen marker of an unchanged row at most once per refresh window", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [job("old"), job("recent")]);
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    store.rows.get("old")!.updatedAt = longAgo;

    const counters = await ingestAll(setup({ store }).ingestor, [job("old"), job("recent")]);
    expect(counters).toMatchObject({ updated: 1, unchanged: 1 });
    expect(store.rows.get("old")!.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("keeps stored liveness / legitimacy when the run did not request signals", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [
      job("1", { liveness: { state: "active" }, legitimacy: { state: "verified", reasons: ["r"] } }),
    ]);
    const counters = await ingestAll(setup({ store }).ingestor, [job("1")]);
    expect(counters).toMatchObject({ unchanged: 1, updated: 0 });
    expect(store.rows.get("1")).toMatchObject({ liveness: "active", legitimacy: "verified", legitimacyReasons: ["r"] });

    const newer = await ingestAll(setup({ store }).ingestor, [job("1", { legitimacy: { state: "likely" } })]);
    expect(newer).toMatchObject({ updated: 1 });
    expect(store.rows.get("1")).toMatchObject({ liveness: "active", legitimacy: "likely", legitimacyReasons: null });
  });

  it("counts invalid jobs and never writes them", async () => {
    const { store, ingestor } = setup();
    ingestor.noteInvalid("id: must be a non-blank string");
    const counters = await ingestAll(ingestor, [job("ok"), { ...job("x"), title: "  " }]);
    expect(counters).toMatchObject({ received: 3, invalid: 2, inserted: 1 });
    expect(store.rows.has("x")).toBe(false);
    expectInvariant(counters);
  });
});

describe("JobIngestor — dedupe", () => {
  it("drops within-run duplicates by external id and by dedupKey (first seen wins)", async () => {
    const { store, ingestor } = setup({ batchSize: 2 });
    const counters = await ingestAll(ingestor, [
      job("1", { dedupKey: "k1" }),
      job("1", { dedupKey: "k1" }),
      job("2", { dedupKey: "k1", site: "linkedin" }),
      job("3", { dedupKey: "k3" }),
    ]);
    expect(counters).toMatchObject({ received: 4, inserted: 2, duplicatesMerged: 2 });
    expect([...store.rows.keys()].sort()).toEqual(["1", "3"]);
    expectInvariant(counters);
  });

  it("keeps one employer's postings that share a title across cities and employment types (dedup=false, spec D22)", async () => {
    // What Ever Jobs streams with dedup=false: every observation, each with the producer's
    // company | title | location key. Its own hybrid dedup had merged these into one another.
    const js = (id: string, city: string, extra: Partial<JobPostDto> = {}) =>
      job(id, {
        title: "Quantitative Trader",
        companyName: "Jane Street",
        location: { city },
        dedupKey: `jane street|quantitative trader|${city.toLowerCase()}`,
        ...extra,
      });
    const { store, ingestor } = setup({ batchSize: 10 });
    const counters = await ingestAll(ingestor, [
      js("gh-ny", "New York", { employmentType: "new_grad" }),
      js("gh-hk", "Hong Kong", { employmentType: "internship" }),
      js("gh-ldn", "London"),
      // The same New York posting seen through a board: a real duplicate, merged by its key.
      js("in-ny", "New York", { site: "indeed" }),
    ]);
    expect([...store.rows.keys()].sort()).toEqual(["gh-hk", "gh-ldn", "gh-ny"]);
    expect(counters).toMatchObject({ received: 4, inserted: 3, duplicatesMerged: 1 });
    expectInvariant(counters);
  });

  it("without a dedupKey (pre-contract server) dedupes within the run by company, title and location", async () => {
    const { store, ingestor } = setup({ batchSize: 10 });
    const counters = await ingestAll(ingestor, [
      job("lever-1", { title: "Data Engineer", companyName: "Acme, Inc.", location: { city: "Austin", state: "TX" } }),
      // Same posting from another source: company suffix, case and punctuation differ.
      job("board-7", { site: "indeed", title: "data engineer", companyName: "ACME", location: { city: "austin", state: "tx" } }),
      // Same title, another city: a different posting.
      job("lever-2", { title: "Data Engineer", companyName: "Acme, Inc.", location: { city: "Denver", state: "CO" } }),
    ]);
    expect([...store.rows.keys()].sort()).toEqual(["lever-1", "lever-2"]);
    expect(counters).toMatchObject({ received: 3, inserted: 2, duplicatesMerged: 1 });
    expectInvariant(counters);
  });

  it("fallbackDedupIdentity: loose company / title, and every location part counts", () => {
    const a = fallbackDedupIdentity({ title: "SWE Intern", companyName: "Acme Corp.", location: { city: "NYC", state: "NY" } });
    expect(fallbackDedupIdentity({ title: "swe intern", companyName: "ACME", location: { city: "nyc", state: "ny" } })).toBe(a);
    expect(fallbackDedupIdentity({ title: "SWE Intern", companyName: "Acme Corp.", location: { city: "NYC", state: "NJ" } })).not.toBe(a);
    expect(fallbackDedupIdentity({ title: "SWE Intern", companyName: "Acme Corp." })).not.toBe(a);
  });

  it("merges a new external id onto the stored row that already owns its dedupKey, keeping the owner's content", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [
      job("lever-1", { dedupKey: "acme|engineer|austin", jobUrl: "https://old" }),
    ]);
    const ownerId = store.rows.get("lever-1")!.id;
    store.resetCalls();

    const run = setup({ store });
    const counters = await ingestAll(run.ingestor, [
      job("greenhouse-9", {
        title: "Engineer lever-1", // same exact title → the index-narrowed probe finds it
        dedupKey: "acme|engineer|austin",
        jobUrl: "https://new",
      }),
    ]);

    expect(store.rows.size).toBe(1);
    expect(store.rows.has("greenhouse-9")).toBe(false);
    const owner = store.rows.get("lever-1")!;
    expect(owner.id).toBe(ownerId);
    expect(owner.jobUrl).toBe("https://old");
    expect((owner.rawData as { id: string }).id).toBe("lever-1");
    expect(counters).toMatchObject({ received: 1, inserted: 0, duplicatesMerged: 1, mergedWrites: 0 });
    expect(store.calls.upsertBatch).toEqual([]); // nothing to write, no statement
    expect(store.calls.findDedupCandidates).toEqual([
      { titles: ["Engineer lever-1"], companies: ["Acme"] },
    ]);
    expectInvariant(counters);
  });

  it("never flips a row between two sources of one posting (A, B, A, B → one write)", async () => {
    const store = new FakeJobStore();
    const A = job("gh-9", { dedupKey: "k", jobUrl: "https://ats", description: "full ATS copy" });
    const B = job("in-1", { site: "indeed", title: "Engineer gh-9", dedupKey: "k", jobUrl: "https://board" });
    const runs: IngestCounters[] = [];
    for (const j of [A, B, A, B]) runs.push(await ingestAll(setup({ store }).ingestor, [j]));

    expect(runs[0]).toMatchObject({ inserted: 1 });
    expect(runs[1]).toMatchObject({ duplicatesMerged: 1, mergedWrites: 0, updated: 0 });
    expect(runs[2]).toMatchObject({ unchanged: 1, updated: 0 });
    expect(runs[3]).toMatchObject({ duplicatesMerged: 1, mergedWrites: 0, updated: 0 });
    expect(store.rows.get("gh-9")).toMatchObject({ site: "greenhouse", jobUrl: "https://ats", description: "full ATS copy" });
    for (const c of runs) expectInvariant(c);
  });

  it("takes over an owner its own source stopped refreshing, and counts the write in mergedWrites", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [job("gh-9", { dedupKey: "k", jobUrl: "https://ats" })]);
    store.rows.get("gh-9")!.updatedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const B = job("in-1", { site: "indeed", title: "Engineer gh-9", dedupKey: "k", jobUrl: "https://board" });
    const takeover = await ingestAll(setup({ store }).ingestor, [B]);
    expect(takeover).toMatchObject({ duplicatesMerged: 1, mergedWrites: 1, updated: 0, inserted: 0 });
    expectInvariant(takeover);
    const row = store.rows.get("gh-9")!;
    expect(row).toMatchObject({ site: "indeed", jobUrl: "https://board" });
    expect((row.rawData as { id: string }).id).toBe("in-1");
    expect(store.rows.size).toBe(1);

    // Freshly taken over → the next sighting of B writes nothing.
    const again = await ingestAll(setup({ store }).ingestor, [B]);
    expect(again).toMatchObject({ duplicatesMerged: 1, mergedWrites: 0 });
  });

  it("gives the job its own row when the owner vanished after the probe", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [job("gone", { dedupKey: "k" })]);
    const run = setup({ store, batchSize: 10 });
    // The probe still sees the owner; it is deleted right after, before the owner lookup.
    const probe = store.findDedupCandidates.bind(store);
    store.findDedupCandidates = async (q) => {
      const found = await probe(q);
      store.rows.delete("gone");
      return found;
    };
    const counters = await ingestAll(run.ingestor, [job("new", { title: "Engineer gone", dedupKey: "k" })]);
    expect(counters).toMatchObject({ inserted: 1, duplicatesMerged: 0 });
    expect(store.rows.has("new")).toBe(true);
    expectInvariant(counters);
  });

  it("prefers an exact external-id match over a merge onto the same row in one batch", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [job("A", { dedupKey: "k" })]);

    const run = setup({ store, batchSize: 10 });
    const counters = await ingestAll(run.ingestor, [
      // New id carrying A's stored key → would merge onto A …
      job("X", { title: "Engineer A", dedupKey: "k", jobUrl: "https://x" }),
      // … but A itself is in the same batch (its key changed with its title): A wins.
      job("A", { dedupKey: "k-renamed", title: "Engineer A (updated)" }),
    ]);
    expect(store.rows.size).toBe(1);
    expect(store.rows.get("A")!.title).toBe("Engineer A (updated)");
    expect(store.rows.get("A")!.jobUrl ?? null).toBeNull();
    expect(counters).toMatchObject({ received: 2, updated: 1, duplicatesMerged: 1 });
    expectInvariant(counters);
  });

  it("only probes for new external ids with a dedupKey, and each title/company once per run", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [job("old", { dedupKey: "k-old" })]);
    store.resetCalls();

    const run = setup({ store, batchSize: 2 });
    await ingestAll(run.ingestor, [
      job("old", { dedupKey: "k-old" }), // exists → no probe
      job("n1", { dedupKey: "k1", title: "T" }),
      job("n2", { dedupKey: "k2", title: "T" }), // title + company already probed
      job("n3", { title: "No key" }), // no dedupKey → no probe
    ]);
    expect(store.calls.findDedupCandidates).toEqual([{ titles: ["T"], companies: ["Acme"] }]);
  });
});

describe("JobIngestor — dedup probe cost", () => {
  it("reads stored dedupKeys (raw_data) only for loosely matching (title, company) candidates", async () => {
    const store = new FakeJobStore();
    // A large employer: many stored postings, none of them the same posting.
    for (let i = 0; i < 20; i++) {
      store.seed({
        externalId: `abbvie-${i}`,
        site: "workday",
        title: `Scientist ${i}`,
        companyName: "AbbVie",
        rawData: { id: `abbvie-${i}`, dedupKey: `abbvie|scientist ${i}` },
      });
    }
    const target = store.seed({
      externalId: "abbvie-eng",
      site: "workday",
      title: "Senior Engineer",
      companyName: "AbbVie",
      rawData: { id: "abbvie-eng", dedupKey: "abbvie|senior engineer|chicago" },
      updatedAt: new Date(),
    });
    // Same company verbatim (step 1 returns all 21 AbbVie rows), title differs only in case:
    // only the one loose (title, company) match has its raw_data read.
    const counters = await ingestAll(setup({ store, batchSize: 10 }).ingestor, [
      job("board-1", {
        site: "indeed",
        title: "SENIOR ENGINEER",
        companyName: "AbbVie",
        dedupKey: "abbvie|senior engineer|chicago",
      }),
    ]);
    expect(store.calls.findDedupCandidates).toEqual([{ titles: ["SENIOR ENGINEER"], companies: ["AbbVie"] }]);
    expect(store.calls.findDedupKeys).toEqual([[target.id]]);
    expect(counters).toMatchObject({ duplicatesMerged: 1, inserted: 0 });

    // Same title verbatim, company differs by its corporate suffix: still found, one key read.
    store.resetCalls();
    const merged = await ingestAll(setup({ store, batchSize: 10 }).ingestor, [
      job("board-2", {
        site: "indeed",
        title: "Senior Engineer",
        companyName: "AbbVie, Inc.",
        dedupKey: "abbvie|senior engineer|chicago",
      }),
    ]);
    expect(store.calls.findDedupKeys).toEqual([[target.id]]);
    expect(merged).toMatchObject({ duplicatesMerged: 1, inserted: 0 });
    expect(store.rows.size).toBe(21);
  });

  it("lets the oldest stored row own a key even when candidates are read in different batches", async () => {
    const store = new FakeJobStore();
    store.seed({ externalId: "newer", site: "s", title: "T", companyName: "Other", rawData: { id: "newer", dedupKey: "k" }, id: 50 });
    store.seed({ externalId: "older", site: "s", title: "U", companyName: "Acme", rawData: { id: "older", dedupKey: "k" }, id: 10 });
    const run = setup({ store, batchSize: 1 });
    await ingestAll(run.ingestor, [
      job("x1", { title: "T", companyName: "Other", dedupKey: "k-other" }), // reads "newer" (key k)
      job("x2", { title: "U", companyName: "Acme", dedupKey: "k" }), // reads "older" (key k, lower id)
    ]);
    // x2 merged onto the oldest owner, not onto "newer".
    expect(store.rows.has("x2")).toBe(false);
    expect(store.rows.get("older")!.title).toBe("U");
  });

  it("looseIdentity ignores case, punctuation, accents and corporate suffixes", () => {
    expect(looseIdentity("Senior Engineer", "AbbVie")).toBe(looseIdentity("SENIOR  ENGINEER!", "AbbVie, Inc."));
    expect(looseIdentity("Ingénieur", "Société Générale S.A.")).toBe("ingenieur|societe generale");
    expect(looseIdentity("Engineer", null)).toBe("engineer|");
    expect(looseIdentity("Engineer", "Co")).toBe("engineer|co"); // a lone suffix word is the name
    expect(looseIdentity("Engineer", "Acme")).not.toBe(looseIdentity("Engineer II", "Acme"));
  });
});

describe("JobIngestor — geocoding", () => {
  it("geocodes each new location once per run and reuses it for later rows", async () => {
    const { ingestor, geocode } = setup({ batchSize: 2 });
    const counters = await ingestAll(ingestor, [job("1"), job("2"), job("3")]);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode).toHaveBeenCalledWith("Austin, TX, USA");
    expect(counters.geocodeCalls).toBe(1);
    expect(counters.geocodeReused).toBe(2);
  });

  it("does not geocode rows whose stored coordinates match their location", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [job("1")]);
    const run = setup({ store });
    const counters = await ingestAll(run.ingestor, [job("1")]);
    expect(run.geocode).not.toHaveBeenCalled();
    expect(counters).toMatchObject({ geocodeCalls: 0, geocodeReused: 0, unchanged: 1 });
    expect(store.rows.get("1")!.latitude).toBe("lat:Austin, TX, USA");
  });

  it("reuses coordinates stored on other rows for the same location instead of calling Google", async () => {
    const store = new FakeJobStore();
    store.seed({
      externalId: "other",
      site: "s",
      title: "t",
      locationCity: " austin ",
      locationState: "tx",
      locationCountry: "usa",
      latitude: "30.2",
      longitude: "-97.7",
    });
    const run = setup({ store });
    const counters = await ingestAll(run.ingestor, [job("new")]);
    expect(run.geocode).not.toHaveBeenCalled();
    expect(store.rows.get("new")).toMatchObject({ latitude: "30.2", longitude: "-97.7" });
    expect(counters).toMatchObject({ geocodeCalls: 0, geocodeReused: 1 });
    expect(store.calls.findCoordsForLocations).toEqual([["austin|tx|usa"]]);
  });

  it("stops calling Google for the rest of the run after OVER_QUERY_LIMIT", async () => {
    const geocode = jest.fn<GeocodeFn>(async () => ({ status: "quota" as const }));
    const { ingestor, store } = setup({ geocode, batchSize: 2 });
    const counters = await ingestAll(ingestor, [
      job("1", { location: { city: "A" } }),
      job("2", { location: { city: "B" } }),
      job("3", { location: { city: "C" } }),
    ]);
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(counters).toMatchObject({ geocodeCalls: 1, inserted: 3 });
    expect(store.rows.get("3")!.latitude ?? null).toBeNull();
  });

  it("skips geocoding entirely without a key, and respects the per-run call cap", async () => {
    const none = setup({ geocode: null });
    const c1 = await ingestAll(none.ingestor, [job("1")]);
    expect(c1.geocodeCalls).toBe(0);

    const capped = setup({ maxCalls: 1 });
    const c2 = await ingestAll(capped.ingestor, [
      job("1", { location: { city: "A" } }),
      job("2", { location: { city: "B" } }),
    ]);
    expect(capped.geocode).toHaveBeenCalledTimes(1);
    expect(c2.geocodeCalls).toBe(1);
  });
});

describe("JobIngestor — failures", () => {
  it("falls back to row-by-row when the bulk statement fails and isolates the bad row", async () => {
    const store = new FakeJobStore();
    store.failBulkUpserts = 1;
    store.poisonIds.add("bad");
    const { ingestor } = setup({ store, batchSize: 5 });
    const counters = await ingestAll(ingestor, [job("a"), job("bad"), job("c")]);
    expect(counters).toMatchObject({ received: 3, inserted: 2, errors: 1 });
    expect(ingestor.errorMessages.join("\n")).toContain("bad");
    expectInvariant(counters);
  });

  it("keeps the counter invariant when a pre-query fails after merges were resolved", async () => {
    const store = new FakeJobStore();
    await ingestAll(setup({ store }).ingestor, [
      job("O1", { dedupKey: "k1", title: "Shared 1" }),
      job("O2", { dedupKey: "k2", title: "Shared 2" }),
    ]);
    // The second findExisting of the next run (loading merge owners) fails.
    let calls = 0;
    const original = store.findExisting.bind(store);
    store.findExisting = async (ids) => {
      calls++;
      if (calls === 2) throw new Error("connection reset");
      return original(ids);
    };
    const run = setup({ store, batchSize: 10 });
    const counters = await ingestAll(run.ingestor, [
      job("O1", { dedupKey: "k1-renamed", title: "Shared 1" }), // exact id → wins over X1
      job("X1", { dedupKey: "k1", title: "Shared 1" }), // merge onto O1 → dropped
      job("X2", { dedupKey: "k2", title: "Shared 2" }), // merge onto O2 → owner lookup fails
    ]);
    expect(counters).toMatchObject({ received: 3, errors: 3, duplicatesMerged: 0 });
    expectInvariant(counters);
  });

  it("aborts after consecutive batches persisted nothing (database down)", async () => {
    const store = new FakeJobStore();
    store.down = true;
    const { ingestor } = setup({ store, batchSize: 1, maxConsecutiveFailedBatches: 2 });
    await ingestor.add(job("1"));
    await expect(ingestor.add(job("2"))).rejects.toBeInstanceOf(IngestAbortedError);
    expect(ingestor.counters.errors).toBe(2);
    expect(ingestor.persisted).toBe(0);
    expectInvariant(ingestor.counters);
  });
});
