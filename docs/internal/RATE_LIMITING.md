# Rate limiting — architecture & how to make it distributed

_Last updated: 2026-06-17_

Hust has **three** rate limiters. This doc maps them, calls out which are
per-pod in-memory vs. distributed, and gives the steps to move the free-tier
daily message cap onto Redis.

## The three limiters

| # | Limiter | Code | Algorithm | Backend (today) | Distributed? |
|---|---------|------|-----------|-----------------|--------------|
| 1 | Free-tier **daily message** cap (10/day), search/cover **peeks** | [`apps/web/lib/subscription-gate.ts`](../../apps/web/lib/subscription-gate.ts) → [`@ever-hust/rate-limit`](../../packages/rate-limit) | fixed-window | **in-memory by default**, Redis-ready | ⚙️ flip on with env |
| 2 | Per-route **API** limit (e.g. chat 30/min, authed 100/min) | [`apps/web/lib/rate-limit.ts`](../../apps/web/lib/rate-limit.ts) | sliding-window | in-memory only | ❌ not yet |
| 3 | Free-tier **search / cover-letter** caps | [`packages/ai/src/rate-limit.ts`](../../packages/ai/src/rate-limit.ts) | sliding-window | Upstash Redis if `UPSTASH_REDIS_REST_URL` set, else in-memory | ✅ (Upstash) |

**Per-pod in-memory** means each replica keeps its own counters in a `Map`. Across
`N` pods a user gets up to `N × limit`, and a redeploy resets the counts. Fine for
single-pod / local dev; leaky once horizontally scaled.

## Limiter #1 — the Redis-ready path (`@ever-hust/rate-limit`)

The daily message cap — the one users actually hit — now goes through the
`@ever-hust/rate-limit` package. It exposes a `RateLimiter` interface with two
drivers:

- `MemoryRateLimiter` — **default**, faithful port of the old in-process counter.
- `RedisRateLimiter` — atomic `INCR`+`PEXPIRE` Lua over a TCP Redis client
  (`ioredis`), so the fixed-window semantics match the in-memory driver exactly
  but the count is shared across pods.

`getRateLimiter()` picks the driver from env at startup. **No code change** is
needed to switch — see the package
[README](../../packages/rate-limit/README.md) for the full enable guide.

### Enable (DigitalOcean Redis), in short

1. Provision DO Managed Redis → copy the `rediss://…:25061/0` connection string.
2. `pnpm --filter web add ioredis` (it's an optional, lazily-imported dep).
3. Set `RATE_LIMIT_REDIS_URL` (optionally `RATE_LIMIT_DRIVER=redis`,
   `RATE_LIMIT_PREFIX`). On k8s, add it to the web Deployment's env / secret.
4. Redeploy. Roll back by unsetting the URL.

> Why `ioredis` and not the already-present `@upstash/redis`? Upstash's client is
> HTTP-only and Upstash-specific; DO/self-hosted/Valkey speak standard Redis TCP.

## Limiter #2 — the remaining migration (deferred)

`apps/web/lib/rate-limit.ts`'s `applyRateLimit()` is **synchronous** and called
inline by ~every API route (`const limited = applyRateLimit(id, tier); if (limited) …`).
Redis is async, so distributing this limiter means making `applyRateLimit` async
and `await`-ing it at every call site — a wide, mechanical change. It's deferred
on purpose; the daily message cap (#1) was the priority. When you do it, the same
`@ever-hust/rate-limit` package can back it (add a sliding-window strategy or
reuse the fixed-window one). Until then it remains a per-pod best-effort DoS guard.

## Limiter #3 — search / cover-letter (already Upstash)

`packages/ai/src/rate-limit.ts` already falls back to in-memory and uses Upstash
when `UPSTASH_REDIS_REST_URL` is configured. Left as-is. If you consolidate
everything onto DO Redis later, this is the second candidate to port onto
`@ever-hust/rate-limit`.

## Exempting an account (testing / comping)

The daily cap only applies to **free** users. `checkSubscription()` treats
`users.subscription_status ∈ {active, past_due}` as unlimited. To comp an account,
set its `subscription_status = 'active'` (revert with `'free'`). This is a DB-level
flag, independent of the limiter backend.
