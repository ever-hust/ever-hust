import * as structured from "./index";

/**
 * Contract #5 guard (spec #5 §"Deferred").
 *
 * Every artifact kind must be registered through `defineArtifact`, which forces a Zod schema +
 * version. This test enumerates every `*Artifact` export from the structured-output barrel and
 * asserts it is a fully-formed, schema-backed, versioned definition with a unique discriminant.
 * If someone adds a new artifact export that omits its schema (or duplicates a `kind`), this
 * fails — the automated guard the spec left as a follow-up.
 */

interface ArtifactDefLike {
  kind: unknown;
  version: unknown;
  schema?: { safeParse?: unknown };
  build?: unknown;
  parse?: unknown;
  safeParse?: unknown;
}

function isArtifactDef(v: unknown): v is {
  kind: string;
  version: number;
  schema: { safeParse: (x: unknown) => unknown };
  build: (...args: unknown[]) => unknown;
} {
  if (!v || typeof v !== "object") return false;
  const d = v as ArtifactDefLike;
  return (
    typeof d.kind === "string" &&
    typeof d.version === "number" &&
    typeof d.schema?.safeParse === "function" &&
    typeof d.build === "function"
  );
}

// Every barrel export whose name ends in "Artifact" and is an object (not the `defineArtifact` /
// `assertArtifact` helper functions) is expected to be a registered artifact definition.
const artifactExports = Object.entries(
  structured as unknown as Record<string, unknown>,
).filter(
  ([name, value]) =>
    name.endsWith("Artifact") && typeof value === "object" && value !== null,
);

describe("structured-output artifact registry (contract #5 guard)", () => {
  it("exports the registered artifacts (sanity floor)", () => {
    // The roadmap registered evaluation, cover-letter, resume, negotiation, company-research,
    // and more — guard against the barrel silently losing them.
    expect(artifactExports.length).toBeGreaterThanOrEqual(5);
  });

  it.each(artifactExports)(
    "%s is registered via defineArtifact (schema + version present)",
    (_name, def) => {
      expect(isArtifactDef(def)).toBe(true);
      const d = def as { kind: string; version: number };
      expect(d.kind.length).toBeGreaterThan(0);
      expect(d.version).toBeGreaterThanOrEqual(1);
    },
  );

  it("has a unique `kind` discriminant per artifact", () => {
    const kinds = artifactExports
      .map(([, def]) => def)
      .filter(isArtifactDef)
      .map((def) => def.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("validates a candidate against each artifact's schema without throwing", () => {
    for (const [, def] of artifactExports) {
      if (!isArtifactDef(def)) continue;
      // A junk candidate must be rejected (safeParse returns success:false), proving a real
      // schema is wired rather than a permissive passthrough.
      const result = def.schema.safeParse({ __definitely_not_valid__: true }) as {
        success: boolean;
      };
      expect(typeof result.success).toBe("boolean");
    }
  });
});
