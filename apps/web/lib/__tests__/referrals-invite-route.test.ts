/**
 * POST /api/referrals/invite: every invite gets its own referral code. `referral_code` is
 * unique, and GET /api/referrals already stores the user's code in a row, so an invite that
 * reused that code failed the insert and answered 500.
 */
import type { FakeReferralsDb } from "./fake-referrals-db";

jest.mock("@ever-hust/db", () =>
  jest.requireActual<typeof import("./fake-referrals-db")>("./fake-referrals-db").everHustDb,
);
jest.mock("drizzle-orm", () =>
  jest.requireActual<typeof import("./fake-referrals-db")>("./fake-referrals-db").drizzleOrm,
);
jest.mock("../get-session-user", () => ({ requireSessionUser: async () => ({ id: "user-1" }) }));
jest.mock("../rate-limit", () => ({ applyRateLimit: () => null }));

import { resetFakeDb } from "./fake-referrals-db";
import { POST } from "../../app/api/referrals/invite/route";

const EXISTING_CODE = "OWNCODE";

function invite(email: string) {
  return POST(
    new Request("http://localhost/api/referrals/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  );
}

describe("POST /api/referrals/invite", () => {
  let db: FakeReferralsDb;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    db = resetFakeDb();
    // The row GET /api/referrals creates to hold the user's own code.
    db.seedReferral({ referrerId: "user-1", referralCode: EXISTING_CODE });
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("creates two invites for a user who already has a code, each with its own new code", async () => {
    const first = await invite("a@example.com");
    const second = await invite("b@example.com");

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const inserted = db.log
      .filter((e) => e.kind === "insert" && e.table === "referrals")
      .map((e) => e.detail as { referralCode: string; referredEmail: string });
    expect(inserted).toHaveLength(2);
    for (const row of inserted) expect(row.referralCode).not.toBe(EXISTING_CODE);
    expect(inserted[0]!.referralCode).not.toBe(inserted[1]!.referralCode);
    expect(inserted.map((r) => r.referredEmail)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns the invite's own code and link", async () => {
    const res = await invite("a@example.com");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { referralCode: string; referralLink: string };

    const row = db.referralRows.find((r) => r.referredEmail === "a@example.com");
    expect(row?.referralCode).toBe(body.referralCode);
    expect(body.referralCode).not.toBe(EXISTING_CODE);
    expect(body.referralLink).toMatch(new RegExp(`/signup\\?ref=${body.referralCode}$`));
  });
});
