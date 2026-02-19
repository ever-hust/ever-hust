/* eslint-disable turbo/no-undeclared-env-vars */
/**
 * Tests for apps/web/lib/startup-checks.ts
 *
 * Tests the runStartupChecks() function by manipulating process.env
 * to simulate different environment configurations.
 */

import { runStartupChecks } from "../startup-checks";

describe("runStartupChecks", () => {
  const originalEnv = process.env;

  // Suppress console output during tests
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    logSpy = jest.spyOn(console, "log").mockImplementation();
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
    errorSpy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    process.env = originalEnv;
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function setMinimalCriticalVars() {
    process.env.DATABASE_URL = "postgres://localhost:5432/test";
    process.env.BETTER_AUTH_SECRET = "test-secret-value";
  }

  describe("critical environment variables", () => {
    it("throws when DATABASE_URL is missing", () => {
      process.env.BETTER_AUTH_SECRET = "test-secret";
      delete process.env.DATABASE_URL;

      expect(() => runStartupChecks()).toThrow("DATABASE_URL");
    });

    it("throws when BETTER_AUTH_SECRET is missing", () => {
      process.env.DATABASE_URL = "postgres://localhost:5432/test";
      delete process.env.BETTER_AUTH_SECRET;

      expect(() => runStartupChecks()).toThrow("BETTER_AUTH_SECRET");
    });

    it("throws when both critical vars are missing", () => {
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;

      expect(() => runStartupChecks()).toThrow();
    });

    it("throws with FATAL prefix in the error message", () => {
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;

      expect(() => runStartupChecks()).toThrow(/FATAL/);
    });

    it("logs error message before throwing", () => {
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;

      expect(() => runStartupChecks()).toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("FATAL"),
      );
    });

    it("does not throw when all critical vars are set", () => {
      setMinimalCriticalVars();

      expect(() => runStartupChecks()).not.toThrow();
    });

    it("does not throw when critical vars are set even if optional ones are missing", () => {
      setMinimalCriticalVars();
      // Explicitly remove optional vars
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.TRIGGER_SECRET_KEY;

      expect(() => runStartupChecks()).not.toThrow();
    });

    it("treats empty string as missing", () => {
      process.env.DATABASE_URL = "";
      process.env.BETTER_AUTH_SECRET = "test-secret";

      expect(() => runStartupChecks()).toThrow("DATABASE_URL");
    });
  });

  describe("AI provider cross-check", () => {
    it("warns when neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is set", () => {
      setMinimalCriticalVars();
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      runStartupChecks();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("OPENROUTER_API_KEY"),
      );
    });

    it("does not warn about AI provider when OPENROUTER_API_KEY is set", () => {
      setMinimalCriticalVars();
      process.env.OPENROUTER_API_KEY = "or-test-key";
      delete process.env.ANTHROPIC_API_KEY;

      runStartupChecks();

      const aiWarningCalls = warnSpy.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === "string" &&
          args[0].includes("OPENROUTER_API_KEY") &&
          args[0].includes("ANTHROPIC_API_KEY"),
      );
      expect(aiWarningCalls).toHaveLength(0);
    });

    it("does not warn about AI provider when ANTHROPIC_API_KEY is set", () => {
      setMinimalCriticalVars();
      delete process.env.OPENROUTER_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      runStartupChecks();

      const aiWarningCalls = warnSpy.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === "string" &&
          args[0].includes("OPENROUTER_API_KEY") &&
          args[0].includes("ANTHROPIC_API_KEY"),
      );
      expect(aiWarningCalls).toHaveLength(0);
    });

    it("does not warn when both AI provider keys are set", () => {
      setMinimalCriticalVars();
      process.env.OPENROUTER_API_KEY = "or-test-key";
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      runStartupChecks();

      const aiWarningCalls = warnSpy.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === "string" &&
          args[0].includes("OPENROUTER_API_KEY") &&
          args[0].includes("ANTHROPIC_API_KEY"),
      );
      expect(aiWarningCalls).toHaveLength(0);
    });
  });

  describe("recommended environment variables", () => {
    it("warns about missing recommended vars", () => {
      setMinimalCriticalVars();
      // Remove some recommended vars
      delete process.env.BETTER_AUTH_URL;
      delete process.env.LINKEDIN_CLIENT_ID;
      delete process.env.STRIPE_SECRET_KEY;

      runStartupChecks();

      // Should warn with count of missing vars
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing recommended environment variables"),
      );
    });

    it("logs impact description for missing recommended vars", () => {
      setMinimalCriticalVars();
      delete process.env.LINKEDIN_CLIENT_ID;

      runStartupChecks();

      // Should log the impact of missing LINKEDIN_CLIENT_ID
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("LINKEDIN_CLIENT_ID"),
      );
    });

    it("does not warn when all recommended vars are set", () => {
      setMinimalCriticalVars();
      // Set all recommended vars
      process.env.BETTER_AUTH_URL = "http://localhost:3000";
      process.env.LINKEDIN_CLIENT_ID = "test-id";
      process.env.LINKEDIN_CLIENT_SECRET = "test-secret";
      process.env.STRIPE_SECRET_KEY = "sk_test_123";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
      process.env.RESEND_API_KEY = "re_test_123";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
      process.env.NEXT_PUBLIC_APP_URL = "https://everjobs.ai";
      // Also set AI keys to suppress that warning
      process.env.OPENROUTER_API_KEY = "or-test-key";

      runStartupChecks();

      // Filter for the "Missing recommended" warning specifically
      const recommendedWarnings = warnSpy.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === "string" &&
          args[0].includes("Missing recommended"),
      );
      expect(recommendedWarnings).toHaveLength(0);
    });
  });

  describe("optional environment variables", () => {
    it("logs info about missing optional vars", () => {
      setMinimalCriticalVars();
      // Remove all optional vars
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.TRIGGER_SECRET_KEY;
      delete process.env.EVER_JOBS_API_URL;
      delete process.env.EVER_JOBS_API_KEY;
      delete process.env.HEALTH_CHECK_TOKEN;
      delete process.env.BYOK_ENCRYPTION_KEY;

      runStartupChecks();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Optional environment variables not configured"),
      );
    });
  });

  describe("idempotency", () => {
    it("can be called multiple times without error", () => {
      setMinimalCriticalVars();

      expect(() => {
        runStartupChecks();
        runStartupChecks();
        runStartupChecks();
      }).not.toThrow();
    });
  });

  describe("startup log messages", () => {
    it("logs 'Running startup checks...' at the beginning", () => {
      setMinimalCriticalVars();
      runStartupChecks();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Running startup checks"),
      );
    });

    it("logs 'Startup checks passed.' on success", () => {
      setMinimalCriticalVars();
      runStartupChecks();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Startup checks passed"),
      );
    });

    it("does not log 'Startup checks passed.' on failure", () => {
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;

      try {
        runStartupChecks();
      } catch {
        // expected
      }

      const passedMessages = logSpy.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === "string" &&
          args[0].includes("Startup checks passed"),
      );
      expect(passedMessages).toHaveLength(0);
    });
  });
});
