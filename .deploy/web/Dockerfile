# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Ever Hust web app (Next.js 16, pnpm 10 Turborepo monorepo) — container image
# for the DigitalOcean k8s cluster (k8s-gauzy). Produces a lean Next.js
# "standalone" runner. Vercel ignores this file (Vercel builds from vercel.json).
# ---------------------------------------------------------------------------

FROM node:24-alpine AS base
# libc6-compat: some native deps expect glibc symbols on Alpine.
RUN apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Builder — install the full workspace, then build the web app + its deps.
# ---------------------------------------------------------------------------
FROM base AS builder

# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time, so they must be
# present here (passed as build-args by the CI workflow). Runtime-only secrets
# (DATABASE_URL, BETTER_AUTH_SECRET, AI keys, …) are injected by k8s at runtime.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY \
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY \
    NEXT_TELEMETRY_DISABLED=1 \
    HUSKY=0

# Install with the full lockfile for deterministic, cache-friendly builds.
# .npmrc carries `node-linker=hoisted` — required so the workspace resolves the
# same flat node_modules layout as CI/local (else e.g. `resend` won't resolve).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Build the web app (turbo builds its workspace deps first).
RUN pnpm build

# ---------------------------------------------------------------------------
# Runner — copy only the standalone server + static assets. Non-root.
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Standalone output (monorepo: outputFileTracingRoot=repo root) mirrors the
# workspace layout — server entry lives at apps/web/server.js.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
