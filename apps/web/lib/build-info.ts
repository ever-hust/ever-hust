/**
 * Build identity of the running server.
 *
 * The CI image builds (`.github/workflows/docker-build-publish-{dev,stage,prod}.yml`) pass
 * `GIT_SHA=${{ github.sha }}` as a build-arg, and `.deploy/web/Dockerfile` sets it as an env in the
 * runtime image. `/api/health` reports it as `commit`, so an operator (or a deploy job) can tell
 * which commit a pod actually runs: a changed image digest alone proves nothing.
 *
 * `null` when unknown: a local or Vercel build, or an image built without the arg (the Docker ARG
 * then defaults to an empty string). Anything that is not a hex commit id is treated as unknown,
 * so a stray value is never reported as a version.
 */
export function buildCommit(env: Record<string, string | undefined> = process.env): string | null {
  const sha = env.GIT_SHA?.trim();
  return sha && /^[0-9a-f]{7,64}$/i.test(sha) ? sha : null;
}
