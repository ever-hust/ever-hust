import { describe, it, expect } from "@jest/globals";
import { errorText, MAX_ERROR_TEXT } from "./errors";

describe("errorText (spec 01a D25)", () => {
  const wrapped = (cause?: Error) => {
    const err = new Error(`Failed query: insert into "jobs" values ($1, $2)\nparams: secret-looking-id,${"x".repeat(5000)}`);
    if (cause) (err as { cause?: unknown }).cause = cause;
    return err;
  };

  it("uses the driver's message for a Drizzle-wrapped error", () => {
    expect(errorText(wrapped(new Error("canceling statement due to statement timeout")))).toBe(
      "canceling statement due to statement timeout",
    );
  });

  it("cuts the parameter list off a wrapped error without a cause (review nit)", () => {
    expect(errorText(wrapped())).toBe('Failed query: insert into "jobs" values ($1, $2)');
  });

  it("keeps other messages as they are, capped", () => {
    expect(errorText(new Error("connection refused"))).toBe("connection refused");
    expect(errorText("plain")).toBe("plain");
    const long = errorText(new Error("y".repeat(MAX_ERROR_TEXT + 10)));
    expect(long).toHaveLength(MAX_ERROR_TEXT + 1);
    expect(long.endsWith("…")).toBe(true);
    // Only Drizzle's wrapper is cut at "params:".
    expect(errorText(new Error("bad input\nparams: kept"))).toBe("bad input\nparams: kept");
  });
});
