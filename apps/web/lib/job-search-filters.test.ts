import { PgDialect } from "drizzle-orm/pg-core";
import { newestFirst } from "./job-search-filters";

describe("newestFirst", () => {
  it("orders by date_posted DESC with undated jobs LAST (Postgres DESC defaults to NULLS FIRST)", () => {
    const { sql } = new PgDialect().sqlToQuery(newestFirst());
    expect(sql).toBe('"jobs"."date_posted" DESC NULLS LAST');
  });
});
