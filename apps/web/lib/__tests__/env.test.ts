/* eslint-disable turbo/no-undeclared-env-vars */
/**
 * Tests for apps/web/lib/env.ts
 *
 * The env module evaluates at import time — calling required() will throw
 * immediately if a required env var is missing. We use jest.isolateModules()
 * to get a fresh module evaluation with each test's env configuration.
 */

// All required env var names that must be set for the module to load
const REQUIRED_ENV_VARS: Record<string, string> = {
  DATABASE_URL: "postgres://localhost:5432/test",
  NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  BETTER_AUTH_SECRET: "test-secret",
  BETTER_AUTH_URL: "http://localhost:8443",
  LINKEDIN_CLIENT_ID: "test-client-id",
  LINKEDIN_CLIENT_SECRET: "test-client-secret",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test_123",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  RESEND_API_KEY: "re_test_123",
};

describe("env module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Start with a clean env for each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function setAllRequiredEnvVars() {
    for (const [key, value] of Object.entries(REQUIRED_ENV_VARS)) {
      process.env[key] = value;
    }
  }

  function importEnv(): Promise<{ env: Record<string, string | undefined> }> {
    return new Promise((resolve, reject) => {
      jest.isolateModules(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mod = require("../env");
          resolve(mod);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  it("loads successfully when all required env vars are set", async () => {
    setAllRequiredEnvVars();
    const { env } = await importEnv();
    expect(env).toBeDefined();
    expect(env.DATABASE_URL).toBe("postgres://localhost:5432/test");
  });

  it("throws when DATABASE_URL is missing", async () => {
    setAllRequiredEnvVars();
    delete process.env.DATABASE_URL;
    await expect(importEnv()).rejects.toThrow("DATABASE_URL");
  });

  it("throws when BETTER_AUTH_SECRET is missing", async () => {
    setAllRequiredEnvVars();
    delete process.env.BETTER_AUTH_SECRET;
    await expect(importEnv()).rejects.toThrow("BETTER_AUTH_SECRET");
  });

  it("throws when STRIPE_SECRET_KEY is missing", async () => {
    setAllRequiredEnvVars();
    delete process.env.STRIPE_SECRET_KEY;
    await expect(importEnv()).rejects.toThrow("STRIPE_SECRET_KEY");
  });

  it("throws when RESEND_API_KEY is missing", async () => {
    setAllRequiredEnvVars();
    delete process.env.RESEND_API_KEY;
    await expect(importEnv()).rejects.toThrow("RESEND_API_KEY");
  });

  it("throws when LINKEDIN_CLIENT_ID is missing", async () => {
    setAllRequiredEnvVars();
    delete process.env.LINKEDIN_CLIENT_ID;
    await expect(importEnv()).rejects.toThrow("LINKEDIN_CLIENT_ID");
  });

  describe("optional env vars with fallbacks", () => {
    it("NEXT_PUBLIC_APP_URL falls back to https://everjobs.ai", async () => {
      setAllRequiredEnvVars();
      delete process.env.NEXT_PUBLIC_APP_URL;
      const { env } = await importEnv();
      expect(env.NEXT_PUBLIC_APP_URL).toBe("https://everjobs.ai");
    });

    it("NEXT_PUBLIC_APP_URL uses the env value when set", async () => {
      setAllRequiredEnvVars();
      process.env.NEXT_PUBLIC_APP_URL = "https://custom.example.com";
      const { env } = await importEnv();
      expect(env.NEXT_PUBLIC_APP_URL).toBe("https://custom.example.com");
    });

    it("NEXT_PUBLIC_APP_NAME falls back to 'Hust'", async () => {
      setAllRequiredEnvVars();
      delete process.env.NEXT_PUBLIC_APP_NAME;
      const { env } = await importEnv();
      expect(env.NEXT_PUBLIC_APP_NAME).toBe("Hust");
    });

    it("EMAIL_FROM falls back to alerts@everjobs.ai", async () => {
      setAllRequiredEnvVars();
      delete process.env.EMAIL_FROM;
      const { env } = await importEnv();
      expect(env.EMAIL_FROM).toBe("alerts@everjobs.ai");
    });

    it("DEFAULT_AI_MODEL falls back to claude-sonnet-4-5-20250929", async () => {
      setAllRequiredEnvVars();
      delete process.env.DEFAULT_AI_MODEL;
      const { env } = await importEnv();
      expect(env.DEFAULT_AI_MODEL).toBe("claude-sonnet-4-5-20250929");
    });

    it("LANGFUSE_BASE_URL falls back to https://cloud.langfuse.com", async () => {
      setAllRequiredEnvVars();
      delete process.env.LANGFUSE_BASE_URL;
      const { env } = await importEnv();
      expect(env.LANGFUSE_BASE_URL).toBe("https://cloud.langfuse.com");
    });
  });

  describe("optional env vars without fallbacks", () => {
    it("OPENROUTER_API_KEY is undefined when not set", async () => {
      setAllRequiredEnvVars();
      delete process.env.OPENROUTER_API_KEY;
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const { env } = await importEnv();
      expect(env.OPENROUTER_API_KEY).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("ANTHROPIC_API_KEY is undefined when not set", async () => {
      setAllRequiredEnvVars();
      delete process.env.ANTHROPIC_API_KEY;
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const { env } = await importEnv();
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      warnSpy.mockRestore();
    });

    it("TRIGGER_SECRET_KEY is undefined when not set", async () => {
      setAllRequiredEnvVars();
      delete process.env.TRIGGER_SECRET_KEY;
      const { env } = await importEnv();
      expect(env.TRIGGER_SECRET_KEY).toBeUndefined();
    });
  });

  describe("empty string handling", () => {
    it("treats empty string as missing for required vars", async () => {
      setAllRequiredEnvVars();
      process.env.DATABASE_URL = "";
      await expect(importEnv()).rejects.toThrow("DATABASE_URL");
    });

    it("treats empty string as missing for BETTER_AUTH_SECRET", async () => {
      setAllRequiredEnvVars();
      process.env.BETTER_AUTH_SECRET = "";
      await expect(importEnv()).rejects.toThrow("BETTER_AUTH_SECRET");
    });

    it("treats empty AI key as unset (warns about no provider)", async () => {
      setAllRequiredEnvVars();
      process.env.OPENROUTER_API_KEY = "";
      delete process.env.ANTHROPIC_API_KEY;

      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const { env } = await importEnv();

      // Empty string falls through to undefined via optional()
      expect(env.OPENROUTER_API_KEY).toBe("");
      warnSpy.mockRestore();
    });
  });

  describe("cross-field validations", () => {
    it("warns when neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is set", async () => {
      setAllRequiredEnvVars();
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      await importEnv();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("OPENROUTER_API_KEY"),
      );
      warnSpy.mockRestore();
    });

    it("does not warn when OPENROUTER_API_KEY is set", async () => {
      setAllRequiredEnvVars();
      process.env.OPENROUTER_API_KEY = "or-test-key";
      delete process.env.ANTHROPIC_API_KEY;

      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      await importEnv();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("does not warn when ANTHROPIC_API_KEY is set", async () => {
      setAllRequiredEnvVars();
      delete process.env.OPENROUTER_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      await importEnv();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
