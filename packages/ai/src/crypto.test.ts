import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { encryptApiKey, decryptApiKey, isEncrypted } from "./crypto";

const TEST_ENCRYPTION_KEY = "test-encryption-key-for-unit-tests-only";

describe("crypto", () => {
  const originalEnv = process.env.BYOK_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.BYOK_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.BYOK_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.BYOK_ENCRYPTION_KEY;
    }
  });

  describe("encryptApiKey", () => {
    it("encrypts a plaintext API key", () => {
      const plaintext = "sk-ant-api03-test-key-123456";
      const encrypted = encryptApiKey(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(":");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
    });

    it("produces different ciphertexts for the same input (random IV)", () => {
      const plaintext = "sk-ant-api03-test-key-123456";
      const encrypted1 = encryptApiKey(plaintext);
      const encrypted2 = encryptApiKey(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("throws if BYOK_ENCRYPTION_KEY is not set", () => {
      const saved = process.env.BYOK_ENCRYPTION_KEY;
      delete process.env.BYOK_ENCRYPTION_KEY;

      expect(() => encryptApiKey("test")).toThrow("BYOK_ENCRYPTION_KEY");

      process.env.BYOK_ENCRYPTION_KEY = saved;
    });
  });

  describe("decryptApiKey", () => {
    it("decrypts a previously encrypted key", () => {
      const plaintext = "sk-ant-api03-real-key-abcdef";
      const encrypted = encryptApiKey(plaintext);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("returns plaintext as-is if not encrypted (no colons)", () => {
      const plaintext = "sk-ant-api03-plain-key";
      const result = decryptApiKey(plaintext);

      expect(result).toBe(plaintext);
    });

    it("returns null if decryption fails (wrong key)", () => {
      const plaintext = "sk-ant-api03-test-key";
      const encrypted = encryptApiKey(plaintext);

      // Change encryption key
      process.env.BYOK_ENCRYPTION_KEY = "different-key-for-testing";
      const result = decryptApiKey(encrypted);

      // Should return null because auth tag won't match
      expect(result).toBeNull();

      // Restore
      process.env.BYOK_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });
  });

  describe("isEncrypted", () => {
    it("returns true for encrypted format", () => {
      const encrypted = encryptApiKey("test-key");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("returns false for plaintext", () => {
      expect(isEncrypted("sk-ant-api03-plain-key")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isEncrypted("")).toBe(false);
    });
  });

  describe("roundtrip", () => {
    it("encrypts and decrypts various key formats", () => {
      const keys = [
        "sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "sk-proj-abcdefghijklmnop",
        "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "a", // minimal
        "x".repeat(500), // long key
      ];

      for (const key of keys) {
        const encrypted = encryptApiKey(key);
        const decrypted = decryptApiKey(encrypted);
        expect(decrypted).toBe(key);
      }
    });
  });
});
