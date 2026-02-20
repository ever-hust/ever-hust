import {
  toggleSetMember,
  exponentialBackoffDelay,
  retryDelayWithJitter,
  isInputElement,
  isInsideDialog,
  matchesShortcut,
  isValidReferralCode,
  urlBase64ToUint8Array,
  extractMessageText,
} from "../hook-utils";

// ── toggleSetMember ─────────────────────────────────────────────────────

describe("toggleSetMember", () => {
  it("adds a value that is not in the set", () => {
    const set = new Set([1, 2, 3]);
    const result = toggleSetMember(set, 4);
    expect(result.has(4)).toBe(true);
    expect(result.size).toBe(4);
  });

  it("removes a value that is in the set", () => {
    const set = new Set([1, 2, 3]);
    const result = toggleSetMember(set, 2);
    expect(result.has(2)).toBe(false);
    expect(result.size).toBe(2);
  });

  it("does not mutate the original set", () => {
    const set = new Set([1, 2]);
    const result = toggleSetMember(set, 3);
    expect(set.size).toBe(2);
    expect(result.size).toBe(3);
    expect(set).not.toBe(result);
  });

  it("works with an empty set", () => {
    const set = new Set<number>();
    const result = toggleSetMember(set, 1);
    expect(result.has(1)).toBe(true);
    expect(result.size).toBe(1);
  });

  it("works with string values", () => {
    const set = new Set(["a", "b"]);
    const added = toggleSetMember(set, "c");
    expect(added.has("c")).toBe(true);
    const removed = toggleSetMember(added, "a");
    expect(removed.has("a")).toBe(false);
  });

  it("toggle twice returns to original state", () => {
    const set = new Set([1, 2, 3]);
    const after = toggleSetMember(toggleSetMember(set, 2), 2);
    expect(after).toEqual(set);
  });
});

// ── exponentialBackoffDelay ─────────────────────────────────────────────

describe("exponentialBackoffDelay", () => {
  it("returns baseDelay for attempt 0", () => {
    expect(exponentialBackoffDelay(0)).toBe(1000);
  });

  it("doubles each attempt", () => {
    expect(exponentialBackoffDelay(0, 1000)).toBe(1000);
    expect(exponentialBackoffDelay(1, 1000)).toBe(2000);
    expect(exponentialBackoffDelay(2, 1000)).toBe(4000);
    expect(exponentialBackoffDelay(3, 1000)).toBe(8000);
  });

  it("uses custom base delay", () => {
    expect(exponentialBackoffDelay(0, 500)).toBe(500);
    expect(exponentialBackoffDelay(1, 500)).toBe(1000);
    expect(exponentialBackoffDelay(2, 500)).toBe(2000);
  });

  it("handles large attempt numbers", () => {
    expect(exponentialBackoffDelay(10, 1000)).toBe(1024000);
  });
});

// ── retryDelayWithJitter ────────────────────────────────────────────────

describe("retryDelayWithJitter", () => {
  it("returns at least baseDelay * 2^attempt", () => {
    for (let i = 0; i < 100; i++) {
      const delay = retryDelayWithJitter(1, 1000, 200);
      expect(delay).toBeGreaterThanOrEqual(2000);
    }
  });

  it("returns at most baseDelay * 2^attempt + maxJitter", () => {
    for (let i = 0; i < 100; i++) {
      const delay = retryDelayWithJitter(1, 1000, 200);
      expect(delay).toBeLessThan(2200);
    }
  });

  it("varies across calls (jitter is random)", () => {
    const delays = Array.from({ length: 20 }, () =>
      retryDelayWithJitter(0, 1000, 200),
    );
    const uniqueDelays = new Set(delays);
    // With 20 random values, we should have at least 2 unique ones
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });

  it("works with zero jitter", () => {
    const delay = retryDelayWithJitter(2, 1000, 0);
    expect(delay).toBe(4000);
  });
});

// ── isInputElement ──────────────────────────────────────────────────────

describe("isInputElement", () => {
  // Use mock HTMLElement-like objects to avoid needing jsdom
  const mockEl = (tagName: string, contentEditable = false) =>
    ({ tagName, isContentEditable: contentEditable }) as unknown as HTMLElement;

  it("returns true for INPUT element", () => {
    expect(isInputElement(mockEl("INPUT"))).toBe(true);
  });

  it("returns true for TEXTAREA element", () => {
    expect(isInputElement(mockEl("TEXTAREA"))).toBe(true);
  });

  it("returns true for contentEditable element", () => {
    expect(isInputElement(mockEl("DIV", true))).toBe(true);
  });

  it("returns false for regular div", () => {
    expect(isInputElement(mockEl("DIV"))).toBe(false);
  });

  it("returns false for button", () => {
    expect(isInputElement(mockEl("BUTTON"))).toBe(false);
  });

  it("returns false for span", () => {
    expect(isInputElement(mockEl("SPAN"))).toBe(false);
  });
});

// ── isInsideDialog ──────────────────────────────────────────────────────

describe("isInsideDialog", () => {
  const mockElInDialog = (inDialog: boolean) =>
    ({
      closest: (selector: string) =>
        selector === "[role='dialog']" && inDialog ? {} : null,
    }) as unknown as HTMLElement;

  it("returns true for non-Escape key inside dialog", () => {
    expect(isInsideDialog(mockElInDialog(true), "k")).toBe(true);
  });

  it("returns false for Escape key inside dialog", () => {
    expect(isInsideDialog(mockElInDialog(true), "Escape")).toBe(false);
  });

  it("returns false for any key outside dialog", () => {
    expect(isInsideDialog(mockElInDialog(false), "k")).toBe(false);
  });
});

// ── matchesShortcut ─────────────────────────────────────────────────────

describe("matchesShortcut", () => {
  const makeEvent = (
    overrides: Partial<
      Pick<
        KeyboardEvent,
        "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
      >
    >,
  ) => ({
    key: "",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  });

  it("matches simple key", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k" }), { key: "k" }),
    ).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(
      matchesShortcut(makeEvent({ key: "K" }), { key: "k" }),
    ).toBe(true);
  });

  it("matches Ctrl shortcut with ctrlKey", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k", ctrlKey: true }), {
        key: "k",
        ctrl: true,
      }),
    ).toBe(true);
  });

  it("matches Ctrl shortcut with metaKey (Mac)", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k", metaKey: true }), {
        key: "k",
        ctrl: true,
      }),
    ).toBe(true);
  });

  it("rejects when shift is pressed but not required", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k", shiftKey: true }), {
        key: "k",
      }),
    ).toBe(false);
  });

  it("requires shift when specified", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k", shiftKey: true }), {
        key: "k",
        shift: true,
      }),
    ).toBe(true);
  });

  it("rejects when alt is pressed but not required", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k", altKey: true }), {
        key: "k",
      }),
    ).toBe(false);
  });

  it("matches alt shortcut", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k", altKey: true }), {
        key: "k",
        alt: true,
      }),
    ).toBe(true);
  });

  it("rejects wrong key", () => {
    expect(
      matchesShortcut(makeEvent({ key: "j" }), { key: "k" }),
    ).toBe(false);
  });

  it("matches meta shortcut definition", () => {
    expect(
      matchesShortcut(makeEvent({ key: "k", metaKey: true }), {
        key: "k",
        meta: true,
      }),
    ).toBe(true);
  });

  it("matches Escape without modifiers", () => {
    expect(
      matchesShortcut(makeEvent({ key: "Escape" }), { key: "Escape" }),
    ).toBe(true);
  });

  it("matches complex shortcut: Ctrl+Shift+P", () => {
    expect(
      matchesShortcut(
        makeEvent({ key: "p", ctrlKey: true, shiftKey: true }),
        { key: "p", ctrl: true, shift: true },
      ),
    ).toBe(true);
  });

  it("rejects Ctrl+Shift+P when only Ctrl is pressed", () => {
    expect(
      matchesShortcut(makeEvent({ key: "p", ctrlKey: true }), {
        key: "p",
        ctrl: true,
        shift: true,
      }),
    ).toBe(false);
  });
});

// ── isValidReferralCode ─────────────────────────────────────────────────

describe("isValidReferralCode", () => {
  it("accepts valid uppercase alphanumeric codes", () => {
    expect(isValidReferralCode("ABC123")).toBe(true);
    expect(isValidReferralCode("WELCOME")).toBe(true);
    expect(isValidReferralCode("A")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidReferralCode("")).toBe(false);
  });

  it("rejects lowercase letters", () => {
    expect(isValidReferralCode("abc")).toBe(false);
    expect(isValidReferralCode("Abc123")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidReferralCode("ABC-123")).toBe(false);
    expect(isValidReferralCode("CODE!")).toBe(false);
    expect(isValidReferralCode("ABC_DEF")).toBe(false);
  });

  it("rejects codes exceeding max length", () => {
    expect(isValidReferralCode("A".repeat(21))).toBe(false);
    expect(isValidReferralCode("A".repeat(20))).toBe(true);
  });

  it("uses custom max length", () => {
    expect(isValidReferralCode("ABCDEF", 5)).toBe(false);
    expect(isValidReferralCode("ABCDE", 5)).toBe(true);
  });
});

// ── urlBase64ToUint8Array ───────────────────────────────────────────────

describe("urlBase64ToUint8Array", () => {
  it("converts a standard base64 string", () => {
    // "Hello" in base64 is "SGVsbG8="
    // In URL-safe base64: "SGVsbG8"
    const result = urlBase64ToUint8Array("SGVsbG8");
    expect(result).toBeInstanceOf(Uint8Array);
    const text = new TextDecoder().decode(result);
    expect(text).toBe("Hello");
  });

  it("handles URL-safe characters (- and _)", () => {
    // Standard base64 uses + and /, URL-safe uses - and _
    // Create a known base64 string with + and / → convert to URL-safe
    const standard = btoa("\xfb\xff\xfe"); // contains + and /
    const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    const result = urlBase64ToUint8Array(urlSafe);
    expect(result[0]).toBe(0xfb);
    expect(result[1]).toBe(0xff);
    expect(result[2]).toBe(0xfe);
  });

  it("adds correct padding for strings of different lengths", () => {
    // Length 1 mod 4 = needs 3 padding chars
    const result1 = urlBase64ToUint8Array("YQ"); // "a" in base64
    expect(new TextDecoder().decode(result1)).toBe("a");

    // Length 2 mod 4 = needs 2 padding chars
    const result2 = urlBase64ToUint8Array("YWI"); // "ab" in base64
    expect(new TextDecoder().decode(result2)).toBe("ab");

    // Length 3 mod 4 = needs 1 padding char
    const result3 = urlBase64ToUint8Array("YWJj"); // "abc" — already divisible by 4
    expect(new TextDecoder().decode(result3)).toBe("abc");
  });

  it("returns correct length", () => {
    const result = urlBase64ToUint8Array("AQIDBA"); // 4 bytes
    expect(result.length).toBe(4);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(3);
    expect(result[3]).toBe(4);
  });
});

// ── extractMessageText ──────────────────────────────────────────────────

describe("extractMessageText", () => {
  it("returns content when available", () => {
    expect(extractMessageText({ content: "Hello world" })).toBe(
      "Hello world",
    );
  });

  it("returns null for empty content and no parts", () => {
    expect(extractMessageText({ content: null })).toBeNull();
    expect(extractMessageText({})).toBeNull();
  });

  it("extracts text from parts when content is null", () => {
    const message = {
      content: null,
      parts: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
    };
    expect(extractMessageText(message)).toBe("Line 1\nLine 2");
  });

  it("filters non-text parts", () => {
    const message = {
      content: null,
      parts: [
        { type: "text", text: "Hello" },
        { type: "tool-call", toolName: "search" },
        { type: "text", text: "World" },
      ],
    };
    expect(extractMessageText(message)).toBe("Hello\nWorld");
  });

  it("returns null for empty parts array", () => {
    expect(extractMessageText({ content: null, parts: [] })).toBeNull();
  });

  it("returns null when parts contain no text entries", () => {
    const message = {
      content: null,
      parts: [
        { type: "tool-call", toolName: "search" },
        { type: "tool-result", result: {} },
      ],
    };
    expect(extractMessageText(message)).toBeNull();
  });

  it("prefers content over parts", () => {
    const message = {
      content: "From content",
      parts: [{ type: "text", text: "From parts" }],
    };
    expect(extractMessageText(message)).toBe("From content");
  });

  it("handles null entries in parts array", () => {
    const message = {
      content: null,
      parts: [null, { type: "text", text: "Valid" }, undefined, 42],
    };
    expect(extractMessageText(message)).toBe("Valid");
  });

  it("returns null for empty string content", () => {
    // Empty string is treated as no content
    const message = {
      content: "",
      parts: [{ type: "text", text: "From parts" }],
    };
    expect(extractMessageText(message)).toBeNull();
  });
});
