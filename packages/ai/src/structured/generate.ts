import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

/**
 * Run a generation, validating its raw output against `schema`, retrying on validation
 * failure up to `attempts` times. The generator is injected so the retry/validation core
 * is pure and unit-testable without the AI SDK.
 *
 * Returns the parsed, validated object. Throws the last error if every attempt fails.
 */
export async function runValidatedGeneration<T>(
  generate: (attempt: number) => Promise<unknown>,
  schema: z.ZodType<T>,
  attempts = 2,
): Promise<T> {
  const max = Math.max(1, attempts);
  let lastError: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const raw = await generate(attempt);
      return schema.parse(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`generation failed after ${max} attempt(s): ${String(lastError)}`);
}

export interface GenerateValidatedOptions<TSchema extends z.ZodTypeAny> {
  model: LanguageModel;
  schema: TSchema;
  system?: string;
  prompt: string;
  /** Human-readable name/description forwarded to the SDK for better structured output. */
  schemaName?: string;
  schemaDescription?: string;
  /** SDK-level (network/API) retries; default 2. */
  maxRetries?: number;
  /** Our own re-validation attempts on schema mismatch; default 2. */
  validationAttempts?: number;
  /** Langfuse / OTEL telemetry passthrough. */
  telemetry?: { functionId?: string; metadata?: Record<string, unknown> };
}

/**
 * Generate a strict, schema-validated object via the Vercel AI SDK's `generateObject`,
 * re-validated at our boundary with bounded retries on mismatch. This is the thin SDK
 * composition over {@link runValidatedGeneration}; the model retries to satisfy the schema.
 */
export async function generateValidatedObject<TSchema extends z.ZodTypeAny>(
  opts: GenerateValidatedOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const {
    model,
    schema,
    system,
    prompt,
    schemaName,
    schemaDescription,
    maxRetries = 2,
    validationAttempts = 2,
    telemetry,
  } = opts;

  return runValidatedGeneration(
    async () => {
      // `generateObject` is heavily overloaded on the schema generic; we relax the call
      // site (re-validation happens below via `schema.parse`) to keep this wrapper generic.
      const result = await generateObject({
        model,
        schema,
        system,
        prompt,
        schemaName,
        schemaDescription,
        maxRetries,
        experimental_telemetry: telemetry
          ? {
              isEnabled: true,
              functionId: telemetry.functionId,
              metadata: telemetry.metadata,
            }
          : undefined,
      } as any);
      return result.object;
    },
    schema as z.ZodType<z.infer<TSchema>>,
    validationAttempts,
  );
}
