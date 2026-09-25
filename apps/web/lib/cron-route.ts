import type { ZodType, ZodTypeDef } from "zod";
import { apiBadRequest, apiError, apiSuccess } from "./api-response";
import { verifyCronRequest } from "./cron-auth";

/**
 * Builds the POST handler for a `/api/cron/<task>` route.
 *
 * 1. {@link verifyCronRequest} (CRON_SECRET; fail closed in production).
 * 2. Optional Zod validation of the JSON body (an empty body is treated as `{}`).
 * 3. Runs the work and returns `{ ok: true, task, durationMs, result }` with the counters.
 *
 * Any failure is a non-2xx — never "200 with errors": errors carrying `cronStatus` (the
 * `CronWorkError` / `CronInputError` from `@ever-hust/triggers/work`) keep their status and put
 * their counters in `details`; anything else is a 500. The Trigger task throws on non-2xx, so the
 * run shows FAILED.
 */
export function createCronHandler<TBody = Record<string, never>>(
  task: string,
  work: (body: TBody) => Promise<unknown>,
  schema?: ZodType<TBody, ZodTypeDef, unknown>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const denied = verifyCronRequest(req);
    if (denied) return denied;

    let body = {} as TBody;
    if (schema) {
      let raw: unknown = {};
      const text = await req.text().catch(() => "");
      if (text.trim()) {
        try {
          raw = JSON.parse(text);
        } catch {
          return apiBadRequest("Request body must be JSON");
        }
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return apiBadRequest("Invalid request body", parsed.error.flatten());
      body = parsed.data;
    }

    const started = Date.now();
    try {
      const result = await work(body);
      return apiSuccess({ ok: true, task, durationMs: Date.now() - started, result }, { isPrivate: true, cacheSeconds: 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = cronStatusOf(err);
      if (status !== undefined) {
        console.error(`[api/cron/${task}] ${status}: ${message}`);
        return apiError(message, status, (err as { cronDetails?: unknown }).cronDetails);
      }
      console.error(`[api/cron/${task}] failed:`, message);
      return apiError(`${task} failed: ${message.slice(0, 300)}`, 500);
    }
  };
}

/** Status of an error thrown by the work layer, when it carries one in the 4xx/5xx range. */
function cronStatusOf(err: unknown): number | undefined {
  const status = (err as { cronStatus?: unknown } | null)?.cronStatus;
  return typeof status === "number" && status >= 400 && status <= 599 ? status : undefined;
}
