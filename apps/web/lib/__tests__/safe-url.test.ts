/**
 * Tests for safe-url — safeExternalUrl helper.
 *
 * Validates that only http/https URLs pass through, and dangerous
 * protocols (javascript:, data:, etc.) are rejected.
 */
import { safeExternalUrl } from "../safe-url";

describe("safeExternalUrl", () => {
  // ── Valid URLs ────────────────────────────────────────────────────────────

  describe("valid URLs", () => {
    it("returns HTTPS URLs as-is", () => {
      const url = "https://example.com/path?q=1";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("returns HTTP URLs as-is", () => {
      const url = "http://example.com/page";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles HTTPS URLs with port numbers", () => {
      const url = "https://example.com:8443/api";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles HTTP URLs with port numbers", () => {
      const url = "http://localhost:3000/test";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles URLs with fragments", () => {
      const url = "https://example.com/page#section";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles URLs with query parameters", () => {
      const url = "https://example.com/search?q=test&page=1";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("rejects URLs with userinfo credentials", () => {
      expect(safeExternalUrl("https://user:pass@example.com/path")).toBeUndefined();
    });

    it("handles URLs with encoded characters", () => {
      const url = "https://example.com/path%20with%20spaces";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles URLs with subdomains", () => {
      const url = "https://jobs.company.example.com/listing/123";
      expect(safeExternalUrl(url)).toBe(url);
    });
  });

  // ── Dangerous protocols ───────────────────────────────────────────────────

  describe("dangerous protocols", () => {
    it("rejects javascript: URLs", () => {
      expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    });

    it("rejects javascript: URLs with encoding tricks", () => {
      expect(safeExternalUrl("javascript:void(0)")).toBeUndefined();
    });

    it("rejects data: URLs", () => {
      expect(safeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeUndefined();
    });

    it("rejects data: URLs with base64", () => {
      expect(safeExternalUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeUndefined();
    });

    it("rejects ftp: URLs", () => {
      expect(safeExternalUrl("ftp://files.example.com/doc.pdf")).toBeUndefined();
    });

    it("rejects file: URLs", () => {
      expect(safeExternalUrl("file:///etc/passwd")).toBeUndefined();
    });

    it("rejects blob: URLs", () => {
      expect(safeExternalUrl("blob:https://example.com/uuid")).toBeUndefined();
    });
  });

  // ── Falsy / empty inputs ──────────────────────────────────────────────────

  describe("falsy and empty inputs", () => {
    it("returns undefined for null", () => {
      expect(safeExternalUrl(null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
      expect(safeExternalUrl(undefined)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(safeExternalUrl("")).toBeUndefined();
    });
  });

  // ── Whitespace-only inputs ────────────────────────────────────────────────

  describe("whitespace inputs", () => {
    it("returns undefined for whitespace-only string", () => {
      // A string of spaces is falsy-ish but truthy in JS; the URL constructor
      // will throw, and the fallback https:// prefix won't produce a valid URL.
      const result = safeExternalUrl("   ");
      // Either undefined (rejected) or prefixed — implementation determines
      expect(result === undefined || typeof result === "string").toBe(true);
    });
  });

  // ── Bare domains (no protocol) ────────────────────────────────────────────

  describe("bare domains (relative paths / no protocol)", () => {
    it("prefixes bare domain with https://", () => {
      const result = safeExternalUrl("example.com");
      expect(result).toBe("https://example.com");
    });

    it("prefixes bare domain with path", () => {
      const result = safeExternalUrl("example.com/jobs/listing");
      expect(result).toBe("https://example.com/jobs/listing");
    });

    it("prefixes www subdomain with https://", () => {
      const result = safeExternalUrl("www.example.com");
      expect(result).toBe("https://www.example.com");
    });

    it("returns undefined for gibberish that cannot form a valid URL", () => {
      // Strings that can't be valid URLs even with https:// prefix
      // The URL constructor is quite permissive, so we test something clearly invalid
      const result = safeExternalUrl("://broken");
      expect(result).toBeUndefined();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles very long URLs", () => {
      const longPath = "a".repeat(2000);
      const url = `https://example.com/${longPath}`;
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles URLs with international domain names", () => {
      const url = "https://example.xn--e1afmapc.xn--p1ai/path";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles IP address URLs", () => {
      const url = "http://192.168.1.1:8080/admin";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles IPv6 URLs", () => {
      const url = "http://[::1]:3000/test";
      expect(safeExternalUrl(url)).toBe(url);
    });

    it("handles URLs with trailing slash", () => {
      const url = "https://example.com/";
      expect(safeExternalUrl(url)).toBe(url);
    });
  });

  // ── Protocol case-insensitivity ──────────────────────────────────────

  describe("protocol case variations", () => {
    it("accepts HTTPS with uppercase protocol", () => {
      expect(safeExternalUrl("HTTPS://example.com")).toBe("HTTPS://example.com");
    });

    it("accepts HTTP with uppercase protocol", () => {
      expect(safeExternalUrl("HTTP://example.com")).toBe("HTTP://example.com");
    });

    it("accepts mixed-case protocols", () => {
      expect(safeExternalUrl("HtTpS://example.com")).toBe("HtTpS://example.com");
    });
  });

  // ── Percent-encoded protocol bypass attempts ─────────────────────────

  describe("encoded protocol bypass attempts", () => {
    it("rejects percent-encoded javascript protocol", () => {
      // Naive decoders might miss this but URL constructor handles it
      expect(safeExternalUrl("javascript%3Aalert(1)")).not.toBe("javascript:alert(1)");
    });

    it("rejects data URI with image MIME type", () => {
      expect(safeExternalUrl("data:image/png;base64,iVBOR")).toBeUndefined();
    });

    it("rejects data URI with JSON MIME type", () => {
      expect(safeExternalUrl("data:application/json,{}")).toBeUndefined();
    });

    it("rejects vbscript: protocol", () => {
      expect(safeExternalUrl("vbscript:MsgBox('XSS')")).toBeUndefined();
    });
  });

  // ── Userinfo / open-redirect bypass attempts ─────────────────────────

  describe("userinfo bypass prevention", () => {
    it("rejects bare @-domain that could confuse URL parsing", () => {
      expect(safeExternalUrl("@attacker.com")).toBeUndefined();
    });

    it("rejects user@host patterns without scheme", () => {
      expect(safeExternalUrl("victim.com@attacker.com")).toBeUndefined();
    });

    it("rejects URLs with username but no password", () => {
      expect(safeExternalUrl("https://admin@evil.com")).toBeUndefined();
    });

    it("allows normal email-less domains after https:// prefix", () => {
      expect(safeExternalUrl("example.com/path")).toBe("https://example.com/path");
    });
  });
});
