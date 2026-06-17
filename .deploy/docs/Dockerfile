# syntax=docker/dockerfile:1
# Hust documentation site (docs.hust.so) — Docusaurus static build served by nginx.
#
# Build context = repo root: the site renders markdown from the top-level `docs/`
# folder (referenced as ../../docs from apps/docs), so both apps/docs and docs/ must
# be in the context. The docs build is self-contained — apps/docs ships its own
# pnpm-lock.yaml and builds with --ignore-workspace (no full monorepo install).
FROM node:20-bookworm-slim AS build
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@10.26.2
WORKDIR /repo
# Markdown source the Docusaurus config reads from (../../docs).
COPY docs/ ./docs/
# The docs app itself (config, theme, sidebar, its own lockfile).
COPY apps/docs/ ./apps/docs/
WORKDIR /repo/apps/docs
RUN pnpm install --ignore-workspace --no-frozen-lockfile
RUN pnpm build

FROM nginx:1.27-alpine AS runner
COPY .deploy/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/build /usr/share/nginx/html
EXPOSE 80
