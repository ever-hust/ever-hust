import { auth } from "@ever-hust/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { applyRateLimit } from "../../../../lib/rate-limit";

const handler = toNextJsHandler(auth);

// Rate-limit POST requests (login/signup attempts) to prevent brute-force attacks.
// GET requests (session checks, OAuth callbacks) are not rate-limited to avoid
// breaking redirect flows.
export async function GET(req: Request) {
  try {
    return await handler.GET(req);
  } catch (error) {
    console.error(
      "[Auth] GET", req.url, "failed:",
      error instanceof Error ? error.message : error,
      error instanceof Error && error.cause ? `\n  Cause: ${error.cause}` : "",
    );
    throw error;
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(`auth:${ip}`, "public");
  if (rateLimited) return rateLimited;
  try {
    return await handler.POST(req);
  } catch (error) {
    console.error(
      "[Auth] POST", req.url, "failed:",
      error instanceof Error ? error.message : error,
      error instanceof Error && error.cause ? `\n  Cause: ${error.cause}` : "",
    );
    throw error;
  }
}
