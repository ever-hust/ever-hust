import { auth } from "@ever-hust/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { applyRateLimit } from "../../../../lib/rate-limit";

const handler = toNextJsHandler(auth);

// Rate-limit POST requests (login/signup attempts) to prevent brute-force attacks.
// GET requests (session checks, OAuth callbacks) are not rate-limited to avoid
// breaking redirect flows.
export const GET = handler.GET;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimited = applyRateLimit(`auth:${ip}`, "public");
  if (rateLimited) return rateLimited;
  return handler.POST(req);
}
