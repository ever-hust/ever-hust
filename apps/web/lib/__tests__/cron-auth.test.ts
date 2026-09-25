import * as nodeCrypto from "node:crypto";
import { cronSecretMatches, extractCronSecret, verifyCronRequest } from "../cron-auth";

const env = process.env as Record<string, string | undefined>;
const saved = { CRON_SECRET: env.CRON_SECRET, NODE_ENV: env.NODE_ENV };

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/cleanup", { method: "POST", headers });
}

let errSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
  env.CRON_SECRET = saved.CRON_SECRET;
  env.NODE_ENV = saved.NODE_ENV;
  jest.restoreAllMocks();
});

describe("verifyCronRequest with CRON_SECRET set", () => {
  beforeEach(() => {
    env.CRON_SECRET = "correct-horse-battery-staple";
    env.NODE_ENV = "production";
  });

  it("401s a request without credentials", async () => {
    const res = verifyCronRequest(req());
    expect(res?.status).toBe(401);
    expect(await res!.json()).toEqual({ error: "Unauthorized" });
  });

  it.each([
    ["wrong secret", { Authorization: "Bearer nope" }],
    ["prefix of the secret", { Authorization: "Bearer correct-horse" }],
    ["secret plus suffix", { Authorization: "Bearer correct-horse-battery-staple!" }],
    ["empty bearer", { Authorization: "Bearer " }],
    ["wrong x-cron-secret", { "x-cron-secret": "nope" }],
  ])("401s a %s", (_label, headers) => {
    expect(verifyCronRequest(req(headers))?.status).toBe(401);
  });

  it("accepts the Bearer secret", () => {
    expect(verifyCronRequest(req({ Authorization: "Bearer correct-horse-battery-staple" }))).toBeNull();
  });

  it("accepts the legacy x-cron-secret header", () => {
    expect(verifyCronRequest(req({ "x-cron-secret": "correct-horse-battery-staple" }))).toBeNull();
  });

  it("tolerates surrounding whitespace in the configured secret (k8s secret with a trailing newline)", () => {
    env.CRON_SECRET = "correct-horse-battery-staple\n";
    expect(verifyCronRequest(req({ Authorization: "Bearer correct-horse-battery-staple" }))).toBeNull();
  });
});

describe("verifyCronRequest with CRON_SECRET unset", () => {
  beforeEach(() => {
    delete env.CRON_SECRET;
  });

  it("FAILS CLOSED in production (503), even with a credential", async () => {
    env.NODE_ENV = "production";
    const res = verifyCronRequest(req({ Authorization: "Bearer anything" }));
    expect(res?.status).toBe(503);
    expect((await res!.json()).error).toContain("CRON_SECRET is not configured");
  });

  it("treats a blank CRON_SECRET as unset (still fails closed in production)", () => {
    env.NODE_ENV = "production";
    env.CRON_SECRET = "   ";
    expect(verifyCronRequest(req())?.status).toBe(503);
  });

  it.each(["development", "test"])("stays open in %s (local dev convenience)", (nodeEnv) => {
    env.NODE_ENV = nodeEnv;
    expect(verifyCronRequest(req())).toBeNull();
  });
});

describe("constant-time comparison", () => {
  it("hashes both sides and compares with crypto.timingSafeEqual on equal-length digests", () => {
    const spy = jest.spyOn(nodeCrypto, "timingSafeEqual");
    expect(cronSecretMatches("short", "a-much-longer-expected-secret")).toBe(false);
    expect(cronSecretMatches("same", "same")).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    for (const [a, b] of spy.mock.calls as [Buffer, Buffer][]) {
      expect(a.length).toBe(32);
      expect(b.length).toBe(32);
    }
  });

  it("the request path goes through the constant-time comparison", () => {
    env.CRON_SECRET = "s3cret";
    env.NODE_ENV = "production";
    const spy = jest.spyOn(nodeCrypto, "timingSafeEqual");
    verifyCronRequest(req({ Authorization: "Bearer guess" }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("never matches an empty expected secret", () => {
    expect(cronSecretMatches("", "")).toBe(false);
  });

  it("extracts Bearer / x-cron-secret credentials", () => {
    expect(extractCronSecret(req({ Authorization: "Bearer abc" }))).toBe("abc");
    expect(extractCronSecret(req({ Authorization: "bearer   abc  " }))).toBe("abc");
    expect(extractCronSecret(req({ "x-cron-secret": "xyz" }))).toBe("xyz");
    expect(extractCronSecret(req())).toBe("");
  });
});
