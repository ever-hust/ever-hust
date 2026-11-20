import { createHmac } from "node:crypto";
import { STATE_MAX_AGE_MS, signState, verifyState } from "../gmail-oauth";

const env = process.env as Record<string, string | undefined>;
const savedSecret = env.BETTER_AUTH_SECRET;

beforeAll(() => {
  env.BETTER_AUTH_SECRET = "state-test-secret";
});
afterAll(() => {
  if (savedSecret === undefined) delete env.BETTER_AUTH_SECRET;
  else env.BETTER_AUTH_SECRET = savedSecret;
});

describe("gmail oauth state", () => {
  it("verifies a fresh state and returns the user id", () => {
    expect(verifyState(signState("user-a"))).toBe("user-a");
  });

  it("still verifies just inside the 10 minute window", () => {
    const t0 = 1_800_000_000_000;
    expect(verifyState(signState("user-a", t0), t0 + STATE_MAX_AGE_MS)).toBe("user-a");
  });

  it("rejects an expired state", () => {
    const t0 = 1_800_000_000_000;
    expect(verifyState(signState("user-a", t0), t0 + STATE_MAX_AGE_MS + 1)).toBeNull();
  });

  it("rejects a state issued far in the future", () => {
    const t0 = 1_800_000_000_000;
    expect(verifyState(signState("user-a", t0 + 60 * 60_000), t0)).toBeNull();
  });

  it("rejects a tampered user id, timestamp, nonce or mac", () => {
    const [userId, issuedAt, nonce, mac] = signState("user-a").split(".") as [string, string, string, string];
    expect(verifyState(["user-b", issuedAt, nonce, mac].join("."))).toBeNull();
    expect(verifyState([userId, String(Number(issuedAt) + 1), nonce, mac].join("."))).toBeNull();
    expect(verifyState([userId, issuedAt, "0".repeat(nonce.length), mac].join("."))).toBeNull();
    expect(verifyState([userId, issuedAt, nonce, "0".repeat(mac.length)].join("."))).toBeNull();
  });

  it("rejects a state signed with another secret", () => {
    const state = signState("user-a");
    env.BETTER_AUTH_SECRET = "other-secret";
    try {
      expect(verifyState(state)).toBeNull();
    } finally {
      env.BETTER_AUTH_SECRET = "state-test-secret";
    }
  });

  it("rejects the old userId.mac format (no timestamp, no nonce)", () => {
    const mac = createHmac("sha256", "state-test-secret").update("user-a").digest("hex");
    expect(verifyState(`user-a.${mac}`)).toBeNull();
  });

  it.each(["", ".", "a.b.c", "....", "user-a.notanumber.nonce.mac"])("rejects malformed state %j", (s) => {
    expect(verifyState(s)).toBeNull();
  });

  it("gives every state a different nonce", () => {
    expect(signState("user-a")).not.toBe(signState("user-a"));
  });

  it("handles user ids that contain dots", () => {
    expect(verifyState(signState("org.user.1"))).toBe("org.user.1");
  });
});
