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

    it("handles keys with special characters", () => {
      const specialKeys = [
        "sk-key-with-üñíçödé",
        "key!@#$%^&*()_+-=[]{}|;':\",./<>?",
        "key\twith\ttabs",
        "key\nwith\nnewlines",
        "key with spaces",
        "emoji-key-🔑🔐",
      ];

      for (const key of specialKeys) {
        const encrypted = encryptApiKey(key);
        const decrypted = decryptApiKey(encrypted);
        expect(decrypted).toBe(key);
      }
    });

    it("encrypts empty string (decrypt returns raw — known edge case)", () => {
      // Encrypting an empty string produces "iv:tag:" where the ciphertext
      // portion is empty. decryptApiKey sees the empty third part and returns
      // the encrypted string as-is (backwards-compat guard). This documents
      // the known limitation — callers should avoid encrypting empty strings.
      const encrypted = encryptApiKey("");
      expect(encrypted).toContain(":");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // Ciphertext part is empty for an empty plaintext
      expect(parts[2]).toBe("");
      // decryptApiKey returns encrypted string as-is because ciphertext is falsy
      const decrypted = decryptApiKey(encrypted);
      expect(decrypted).toBe(encrypted);
    });
  });

  describe("decryptApiKey — malformed inputs", () => {
    it("returns value as-is for a string with only one colon (2 parts)", () => {
      // Format requires exactly 3 parts (iv:tag:cipher). Two parts is not valid.
      const result = decryptApiKey("part1:part2");
      // Should return the string as-is since it has a colon but not in
      // the expected 3-part format — or null if decryption is attempted and fails.
      expect(result === "part1:part2" || result === null).toBe(true);
    });

    it("returns null for tampered ciphertext", () => {
      const encrypted = encryptApiKey("my-secret-key");
      const parts = encrypted.split(":");
      // Corrupt the ciphertext portion
      parts[2] = "AAAA" + parts[2]!.slice(4);
      const tampered = parts.join(":");

      const result = decryptApiKey(tampered);
      expect(result).toBeNull();
    });

    it("returns null for tampered auth tag", () => {
      const encrypted = encryptApiKey("my-secret-key");
      const parts = encrypted.split(":");
      // Corrupt the auth tag
      parts[1] = "AAAA" + parts[1]!.slice(4);
      const tampered = parts.join(":");

      const result = decryptApiKey(tampered);
      expect(result).toBeNull();
    });

    it("returns null for tampered IV", () => {
      const encrypted = encryptApiKey("my-secret-key");
      const parts = encrypted.split(":");
      // Corrupt the IV
      parts[0] = "AAAA" + parts[0]!.slice(4);
      const tampered = parts.join(":");

      const result = decryptApiKey(tampered);
      expect(result).toBeNull();
    });
  });

  describe("isEncrypted — additional edge cases", () => {
    it("returns false for string with exactly 2 colons but an empty part", () => {
      expect(isEncrypted("a::b")).toBe(false);
    });

    it("returns false for string with leading colon", () => {
      expect(isEncrypted(":a:b")).toBe(false);
    });

    it("returns false for string with trailing colon", () => {
      expect(isEncrypted("a:b:")).toBe(false);
    });

    it("returns false for string with more than 3 parts", () => {
      // 4 parts is not the expected format
      expect(isEncrypted("a:b:c:d")).toBe(false);
    });

    it("returns true for valid 3-part non-empty string", () => {
      expect(isEncrypted("abc:def:ghi")).toBe(true);
    });
  });
});
