import type { z } from "zod";

/**
 * The structured-output / machine-summary contract (spec #5).
 *
 * Every AI tool/agent that produces a durable artifact returns an {@link Artifact}:
 * a versioned envelope carrying a strict, Zod-validated `summary` (whitelisted fields
 * we intend to query/aggregate) plus optional human-readable `prose`.
 *
 * The `summary` is the queryable substrate the rest of the product (evaluation engine,
 * funnel analytics, the learning loop) builds on — prose alone is not queryable.
 */
export interface Artifact<TKind extends string, TSummary> {
  /** Discriminant — "evaluation" | "cover_letter" | "interview_prep" | … */
  kind: TKind;
  /** Bump on a breaking schema change; old rows keep their version (readers switch on it). */
  schemaVersion: number;
  /** Strict, Zod-validated machine summary — whitelisted fields only, no free-form blobs. */
  summary: TSummary;
  /** Optional human narration (the LLM-written text). */
  prose?: string;
}

/**
 * A registered artifact kind: its `kind` discriminant, `version`, Zod `schema`, and
 * helpers to validate a candidate summary and build a well-formed {@link Artifact}.
 */
export interface ArtifactDefinition<
  TKind extends string,
  TSchema extends z.ZodTypeAny,
> {
  readonly kind: TKind;
  readonly version: number;
  readonly schema: TSchema;
  /** Validate a candidate summary; throws `ZodError` on mismatch. */
  parse(summary: unknown): z.infer<TSchema>;
  /** Validate a candidate summary without throwing. */
  safeParse(summary: unknown): z.SafeParseReturnType<unknown, z.infer<TSchema>>;
  /** Validate `summary` and wrap it in a well-formed {@link Artifact}. */
  build(
    summary: z.infer<TSchema>,
    prose?: string,
  ): Artifact<TKind, z.infer<TSchema>>;
}

/**
 * Register an artifact kind. The returned definition is the single source of truth
 * for that kind's discriminant, version, and validation.
 */
export function defineArtifact<
  TKind extends string,
  TSchema extends z.ZodTypeAny,
>(
  kind: TKind,
  version: number,
  schema: TSchema,
): ArtifactDefinition<TKind, TSchema> {
  return {
    kind,
    version,
    schema,
    parse: (summary) => schema.parse(summary),
    safeParse: (summary) => schema.safeParse(summary),
    build: (summary, prose) => ({
      kind,
      schemaVersion: version,
      summary: schema.parse(summary),
      ...(prose !== undefined ? { prose } : {}),
    }),
  };
}

/** Thrown by {@link assertArtifact} in non-production environments on validation failure. */
export class ArtifactValidationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.name = "ArtifactValidationError";
    this.issues = issues;
  }
}

export interface AssertOptions<TSummary> {
  /** Override environment detection (defaults to `NODE_ENV === "production"`). */
  isProd?: boolean;
  /** Safe summary used in production when validation fails — prevents 500s over a summary. */
  fallback?: TSummary;
  /** Structured logger; defaults to `console.error`. */
  logger?: (message: string, issues: string[]) => void;
}

function defaultLogger(message: string, issues: string[]): void {
  // eslint-disable-next-line no-console
  console.error(message, issues);
}

/**
 * Validate an {@link Artifact} right before persistence.
 *
 * - Dev/test: throws {@link ArtifactValidationError} on any mismatch (fail loud).
 * - Production: logs and drops to a safe `fallback` (or returns the artifact as-is if
 *   no fallback is provided) — a malformed summary must never 500 the user.
 *
 * Checks the `kind`, `schemaVersion`, and re-validates `summary` against the schema.
 */
export function assertArtifact<TKind extends string, TSchema extends z.ZodTypeAny>(
  def: ArtifactDefinition<TKind, TSchema>,
  artifact: Artifact<TKind, unknown>,
  options: AssertOptions<z.infer<TSchema>> = {},
): Artifact<TKind, z.infer<TSchema>> {
  const {
    isProd = process.env.NODE_ENV === "production",
    fallback,
    logger = defaultLogger,
  } = options;

  const issues: string[] = [];
  if (artifact.kind !== def.kind) {
    issues.push(`kind mismatch: expected "${def.kind}", got "${artifact.kind}"`);
  }
  if (artifact.schemaVersion !== def.version) {
    issues.push(
      `schemaVersion mismatch: expected ${def.version}, got ${artifact.schemaVersion}`,
    );
  }
  const parsed = def.schema.safeParse(artifact.summary);
  if (!parsed.success) {
    issues.push(`summary invalid: ${parsed.error.message}`);
  }

  if (issues.length === 0 && parsed.success) {
    return {
      kind: def.kind,
      schemaVersion: def.version,
      summary: parsed.data,
      ...(artifact.prose !== undefined ? { prose: artifact.prose } : {}),
    };
  }

  const message = `[structured] artifact "${def.kind}" failed validation: ${issues.join("; ")}`;
  if (!isProd) {
    throw new ArtifactValidationError(message, issues);
  }

  // Production: log + degrade gracefully.
  logger(message, issues);
  if (fallback !== undefined) {
    return {
      kind: def.kind,
      schemaVersion: def.version,
      summary: fallback,
      ...(artifact.prose !== undefined ? { prose: artifact.prose } : {}),
    };
  }
  return artifact as Artifact<TKind, z.infer<TSchema>>;
}
