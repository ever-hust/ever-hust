/**
 * POST /api/referrals/redeem: an account can be referred once. A user who is already the
 * referred user of a referral gets 400, and the referrer earns nothing more, so one account
 * can't redeem invite code after invite code to credit the same referrer again and again.
 */
import type { FakeReferralsDb } from "./fake-referrals-db";

jest.mock("@ever-hust/db", () =>
  jest.requireActual<typeof import("./fake-referrals-db")>("./fake-referrals-db").everHustDb,
);
jest.mock("drizzle-orm", () =>
  jest.requireActual<typeof import("./fake-referrals-db")>("./fake-referrals-db").drizzleOrm,
);
jest.mock("../get-session-user", () => ({ requireSessionUser: async () => ({ id: "user-2" }) }));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));

import { resetFakeDb } from "./fake-referrals-db";
import { POST } from "../../app/api/referrals/redeem/route";

function redeem(code: string) {
  return POST(
    new Request("http://localhost/api/referrals/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );
}

describe("POST /api/referrals/redeem", () => {
  let db: FakeReferralsDb;

  beforeEach(() => {
    db = resetFakeDb();
    // user-1 has two pending invite codes and a credit balance.
    db.seedReferral({ referrerId: "user-1", referralCode: "CODEAA" });
    db.seedReferral({ referrerId: "user-1", referralCode: "CODEBB" });
    db.seedCredits({ userId: "user-1", balance: 0, totalEarned: 0 });
  });

  it("credits the referrer when a user redeems for the first time", async () => {
    const res = await redeem("CODEAA");

    expect(res.status).toBe(200);
    expect(db.creditRows[0]).toMatchObject({ balance: 50, totalEarned: 50 });
    expect(db.referralRows[0]).toMatchObject({ referredUserId: "user-2", status: "credited" });
  });

  it("returns 400 for a user who already redeemed a code and does not credit again", async () => {
    expect((await redeem("CODEAA")).status).toBe(200);
    const updatesBefore = db.log.filter((e) => e.kind === "update").length;

    const res = await redeem("CODEBB");

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/already redeemed/i);
    expect(db.creditRows[0]).toMatchObject({ balance: 50, totalEarned: 50 });
    expect(db.log.filter((e) => e.kind === "update")).toHaveLength(updatesBefore);
    expect(db.referralRows[1]).toMatchObject({ referredUserId: null, status: "pending" });
  });

  it("returns 400 when the user is already a referred user from an earlier referral", async () => {
    db.seedReferral({
      referrerId: "user-3",
      referralCode: "OLDONE",
      referredUserId: "user-2",
      status: "credited",
    });

    const res = await redeem("CODEAA");

    expect(res.status).toBe(400);
    expect(db.log.some((e) => e.kind === "update" && e.table === "referralCredits")).toBe(false);
    expect(db.creditRows[0]).toMatchObject({ balance: 0, totalEarned: 0 });
    expect(db.referralRows[0]).toMatchObject({ referredUserId: null, status: "pending" });
  });

  it("takes a per-user lock before checking, so concurrent redeems can't both pass", async () => {
    await redeem("CODEAA");

    const lockAt = db.log.findIndex((e) => e.kind === "execute");
    const firstSelect = db.log.findIndex((e) => e.kind === "select");
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(lockAt).toBeLessThan(firstSelect);
    const lock = db.log[lockAt]!.detail as { strings: string[]; values: unknown[] };
    expect(lock.strings.join("?")).toMatch(/pg_advisory_xact_lock/);
    expect(lock.values).toContain("user-2");
  });
});
