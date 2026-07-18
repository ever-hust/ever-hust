# @ever-hust/rate-limit

A small, driver-agnostic **fixed-window** rate limiter.

- **Default driver: in-memory** (per-process). Identical to the historical
  free-tier counter behaviour — safe for local dev and single-pod deploys, but
  counts are **not** shared across pods (a user effectively gets `N × limit`
  across `N` replicas).
- **Optional driver: Redis** (TCP) for distributed enforcement across pods.
  **Off by default** — stays in-memory until you set `RATE_LIMIT_REDIS_URL`.

This package exists to make the free-tier **daily message cap** distributed. It
is wired into [`apps/web/lib/subscription-gate.ts`](../../apps/web/lib/subscription-gate.ts)
(`checkMessageLimit`). With Redis enabled, that cap holds across all pods instead
of resetting per-pod on each redeploy.

## Usage

```ts
import { getRateLimiter } from "@ever-hust/rate-limit";

const limiter = getRateLimiter(); // process-wide singleton

const { allowed, remaining } = await limiter.consume(`msg:${userId}`, {
  limit: 10,
  windowMs: 24 * 60 * 60 * 1000,
});
if (!allowed) {
  // reject — daily quota exhausted
}
```

`consume` records one event; `peek(key, opts)` reads usage without recording.
Both are async-safe — `await` them and you stay agnostic to the backend.

## Enabling Redis (e.g. DigitalOcean Managed Redis)

Redis is **disabled by default**. To turn it on:

1. **Provision Redis.** DigitalOcean → Databases → Redis/Valkey. Copy the
   connection string — it looks like
   `rediss://default:<password>@<host>.db.ondigitalocean.com:25061/0`
   (note `rediss://` = TLS; keep it).

2. **Install the client** where the limiter runs (the web app):

   ```bash
   pnpm --filter web add ioredis
   ```

   `ioredis` is an **optional** dependency — it is imported lazily and only when
   Redis is enabled, so it isn't installed (or bundled) by default.

3. **Set env vars** (see [`apps/web/.env.example`](../../apps/web/.env.example)):

   | Var | Required | Purpose |
   |-----|----------|---------|
   | `RATE_LIMIT_REDIS_URL` | yes | Redis connection string. Its presence flips the default driver to Redis. |
   | `RATE_LIMIT_DRIVER` | no | `memory` \| `redis` to force a driver explicitly (overrides URL-presence detection). |
   | `RATE_LIMIT_PREFIX` | no | Redis key namespace (default `everhust:rl:`). |

4. **Redeploy.** No code change is needed — `getRateLimiter()` reads the env at
   startup and selects the driver. To roll back, unset `RATE_LIMIT_REDIS_URL`
   (or set `RATE_LIMIT_DRIVER=memory`) and redeploy.

> **Why `ioredis`, not `@upstash/redis`?** Upstash's client speaks HTTP REST and
> only targets Upstash. DigitalOcean (and self-hosted / Valkey) speak the standard
> Redis TCP protocol, which `ioredis` handles. The existing
> [`packages/ai/src/rate-limit.ts`](../../packages/ai/src/rate-limit.ts) limiter
> (search / cover-letter caps) is a separate, Upstash-specific path; this package
> does not touch it.

## Semantics

Fixed-window counter: a new/expired window starts at 1 and blocks once the count
exceeds `limit`. A user can burst up to ~2× the limit across a window boundary —
the same trade-off the in-memory counter has always had. The Redis driver uses an
atomic `INCR` + `PEXPIRE` Lua script so its window matches the in-memory driver
exactly.

`peek()` is fully supported in-memory (synchronous via `MemoryRateLimiter`). Under
the Redis driver, the synchronous `peek*` helpers in `subscription-gate.ts` read a
local in-memory view (best-effort) — the authoritative count lives in Redis. The
usage-stats endpoint that consumes them is non-critical; if you need exact remote
peeks, call `limiter.peek()` directly and `await` it.

## What is and isn't wired

| Limiter | Location | Status |
|---------|----------|--------|
| Daily **message** cap (free tier) | `apps/web/lib/subscription-gate.ts` | ✅ Uses this package — Redis-ready. |
| Per-minute **API** rate limit | `apps/web/lib/rate-limit.ts` | ⛔ Still in-memory + **synchronous**. Migrating it to Redis means making `applyRateLimit` async across every route — deferred. See [`docs/internal/RATE_LIMITING.md`](../../docs/internal/RATE_LIMITING.md). |
| Search / cover-letter caps | `packages/ai/src/rate-limit.ts` | ➖ Separate Upstash path; unchanged. |
