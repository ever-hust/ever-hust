import { PgDialect } from "drizzle-orm/pg-core";
import { buildJobFilterConditions, newestFirst } from "./job-search-filters";

describe("newestFirst", () => {
  it("orders by date_posted DESC with undated jobs LAST (Postgres DESC defaults to NULLS FIRST)", () => {
    const { sql } = new PgDialect().sqlToQuery(newestFirst());
    expect(sql).toBe('"jobs"."date_posted" DESC NULLS LAST');
  });
});

describe("buildJobFilterConditions — postedWithinDays", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z");
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("adds no condition when postedWithinDays is absent", () => {
    expect(buildJobFilterConditions({}, NOW)).toHaveLength(0);
  });

  it("filters date_posted >= now - N days", () => {
    const conditions = buildJobFilterConditions({ postedWithinDays: 7 }, NOW);
    expect(conditions).toHaveLength(1);
    const { sql, params } = new PgDialect().sqlToQuery(conditions[0]!);
    expect(sql).toBe('"jobs"."date_posted" >= $1');
    expect(params).toHaveLength(1);
    expect(new Date(params[0] as string | Date).getTime()).toBe(NOW.getTime() - 7 * DAY_MS);
  });

  it("supports the 24-hour window", () => {
    const conditions = buildJobFilterConditions({ postedWithinDays: 1 }, NOW);
    const { params } = new PgDialect().sqlToQuery(conditions[0]!);
    expect(new Date(params[0] as string | Date).getTime()).toBe(NOW.getTime() - DAY_MS);
  });

  it.each([0, -3, 366, Number.NaN, Number.POSITIVE_INFINITY])(
    "ignores an out-of-range window (%s) instead of building a bad cutoff",
    (days) => {
      expect(buildJobFilterConditions({ postedWithinDays: days }, NOW)).toHaveLength(0);
    },
  );

  it("combines with the existing filters without changing them", () => {
    const base = buildJobFilterConditions({ keywords: "react", isRemote: true }, NOW);
    const withPosted = buildJobFilterConditions(
      { keywords: "react", isRemote: true, postedWithinDays: 30 },
      NOW,
    );
    expect(base).toHaveLength(2);
    expect(withPosted).toHaveLength(3);
  });
});
