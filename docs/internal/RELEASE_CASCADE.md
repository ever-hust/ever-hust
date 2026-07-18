# Release cascade — develop → stage → main

_Last updated: 2026-06-17_

Hust promotes changes through three branches, each mapped to an environment on the
**same** DigitalOcean k8s cluster (`do-sfo2-k8s-gauzy`), isolated by namespace.

| Branch | Env | Host | Namespace | Deploys on | Image tag |
|--------|-----|------|-----------|-----------|-----------|
| `develop` (default) | integration | — (CI only) | — | nothing — `ci.yml` runs lint/types/unit/E2E | — |
| `stage` | staging | `stage.hust.so` | `hust-stage` | push to `stage` → build → deploy | `ghcr.io/ever-hust/hust-web:stage` |
| `main` | **production** | `app.hust.so` | `default` | push to `main` → build → deploy | `ghcr.io/ever-hust/hust-web:latest` |

**Production deploys ONLY from `main`.** The prod build (`docker-build-publish-prod.yml`)
triggers on `push: branches: [main]`; the prod deploy (`deploy-do-prod.yml`) triggers on
that build's completion, gated to `branches: [main]` **and** an explicit
`head_branch == 'main'` guard. Pushing `develop` or `stage` never touches prod.

> Note: the repo's **default branch is `develop`**, so `workflow_run`-triggered deploys
> execute using the workflow file from `develop` and show `headBranch: develop` in the
> Actions UI — that's a display artifact, not a develop→prod deploy.

## How to promote

```
feature work ──► develop ──(PR)──► stage ──(PR)──► main
                  (CI)            (deploy          (deploy
                                   stage.hust.so)   app.hust.so / PROD)
```

1. Land work on `develop` (CI must be green).
2. **develop → stage**: open a PR `base: stage, head: develop`, merge → stage builds &
   deploys to `stage.hust.so`. Validate there.
3. **stage → main**: open a PR `base: main, head: stage`, merge → prod builds & deploys
   to `app.hust.so`.

Use **merge commits** for promotion PRs (preserve history); never squash a promotion.

## Activating stage (one-time)

The stage workflows + manifest are in the repo but inert until the stage env exists.
To turn it on:

1. **DNS** — point `stage.hust.so` at the same ingress LB IP as `app.hust.so`
   (the nginx ingress controller on `do-sfo2-k8s-gauzy`).
2. **GitHub Actions secrets** (repo settings → Secrets and variables → Actions):
   | Secret | What |
   |--------|------|
   | `HUST_STAGE_ENV` | Stage runtime env (dotenv). Mirror `HUST_PROD_ENV`, but point `NEXT_PUBLIC_APP_URL` at `https://stage.hust.so` and use stage-appropriate values (ideally a **separate Supabase project/DB** and **test-mode** Stripe/LinkedIn keys so stage never touches prod data). |
   | `HUST_STAGE_INGRESS_CERT` | base64 of the `stage.hust.so` TLS cert (PEM). Optional — omit and the ingress simply lacks a cert until provided. |
   | `HUST_STAGE_INGRESS_CERT_KEY` | base64 of the TLS private key (PEM). |

   `HUST_KUBECONFIG` is reused from prod (same cluster).
3. **Create + push the `stage` branch** (from `develop` or `main`):
   ```bash
   git switch -c stage main && git push -u origin stage
   ```
   The first push triggers the stage build + deploy. (Until the secrets above exist,
   the deploy will fail / crash-loop on missing env — add them first.)

## Schema changes

New DB tables/columns need `pnpm db:push` against the target environment's database
before the app rolls, per environment. Keep stage on its own database so stage
migrations never hit prod.

## Files

- `.github/workflows/docker-build-publish-stage.yml` — stage image build (push to `stage`).
- `.github/workflows/deploy-do-stage.yml` — stage k8s deploy.
- `.deploy/k8s/k8s-manifest.stage.yaml` — stage Deployment/Service/Ingress (`hust-stage` ns).
- Prod equivalents: `docker-build-publish-prod.yml`, `deploy-do-prod.yml`, `k8s-manifest.prod.yaml`.
