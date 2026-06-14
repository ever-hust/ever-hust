import { z } from "zod";
import {
  defineArtifact,
  assertArtifact,
  ArtifactValidationError,
  type Artifact,
} from "./contract";

const widgetSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
});

const widgetArtifact = defineArtifact("widget", 1, widgetSchema);

describe("defineArtifact", () => {
  it("exposes kind, version, and schema", () => {
    expect(widgetArtifact.kind).toBe("widget");
    expect(widgetArtifact.version).toBe(1);
    expect(widgetArtifact.schema).toBe(widgetSchema);
  });

  it("parse() returns the validated summary", () => {
    expect(widgetArtifact.parse({ id: 1, label: "ok" })).toEqual({
      id: 1,
      label: "ok",
    });
  });

  it("parse() throws on invalid summary", () => {
    expect(() => widgetArtifact.parse({ id: -1, label: "" })).toThrow();
  });

  it("safeParse() reports success/failure without throwing", () => {
    expect(widgetArtifact.safeParse({ id: 2, label: "x" }).success).toBe(true);
    expect(widgetArtifact.safeParse({ id: 0, label: "" }).success).toBe(false);
  });

  it("build() wraps a validated summary in a versioned envelope", () => {
    const artifact = widgetArtifact.build({ id: 3, label: "hi" }, "some prose");
    expect(artifact).toEqual({
      kind: "widget",
      schemaVersion: 1,
      summary: { id: 3, label: "hi" },
      prose: "some prose",
    });
  });

  it("build() omits prose when not provided", () => {
    const artifact = widgetArtifact.build({ id: 4, label: "hi" });
    expect("prose" in artifact).toBe(false);
  });

  it("build() validates and throws on a bad summary", () => {
    expect(() =>
      widgetArtifact.build({ id: -5, label: "" } as never),
    ).toThrow();
  });
});

describe("assertArtifact", () => {
  const good: Artifact<"widget", unknown> = {
    kind: "widget",
    schemaVersion: 1,
    summary: { id: 7, label: "fine" },
  };

  it("returns the normalized artifact when valid", () => {
    const result = assertArtifact(widgetArtifact, good);
    expect(result.summary).toEqual({ id: 7, label: "fine" });
    expect(result.kind).toBe("widget");
    expect(result.schemaVersion).toBe(1);
  });

  it("preserves prose when present", () => {
    const result = assertArtifact(widgetArtifact, { ...good, prose: "p" });
    expect(result.prose).toBe("p");
  });

  it("throws ArtifactValidationError on kind mismatch (dev)", () => {
    expect(() =>
      assertArtifact(widgetArtifact, { ...good, kind: "gadget" as never }),
    ).toThrow(ArtifactValidationError);
  });

  it("throws on schemaVersion mismatch (dev)", () => {
    expect(() =>
      assertArtifact(widgetArtifact, { ...good, schemaVersion: 2 }),
    ).toThrow(ArtifactValidationError);
  });

  it("throws on an invalid summary (dev)", () => {
    expect(() =>
      assertArtifact(widgetArtifact, { ...good, summary: { id: -1, label: "" } }),
    ).toThrow(ArtifactValidationError);
  });

  it("collects multiple issues on the error", () => {
    try {
      assertArtifact(widgetArtifact, {
        kind: "gadget" as never,
        schemaVersion: 99,
        summary: { nope: true },
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ArtifactValidationError);
      expect((err as ArtifactValidationError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("in production, logs and uses the fallback instead of throwing", () => {
    const logger = jest.fn();
    const result = assertArtifact(
      widgetArtifact,
      { ...good, summary: { id: -1, label: "" } },
      { isProd: true, fallback: { id: 1, label: "fallback" }, logger },
    );
    expect(logger).toHaveBeenCalledTimes(1);
    expect(result.summary).toEqual({ id: 1, label: "fallback" });
  });

  it("in production with no fallback, logs and returns the artifact as-is", () => {
    const logger = jest.fn();
    const bad = { ...good, summary: { id: -1, label: "" } };
    const result = assertArtifact(widgetArtifact, bad, { isProd: true, logger });
    expect(logger).toHaveBeenCalledTimes(1);
    expect(result.summary).toEqual({ id: -1, label: "" });
  });
});
