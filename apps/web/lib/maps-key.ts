/**
 * Server-side Google Maps API key.
 *
 * This MUST NOT be a `NEXT_PUBLIC_*` variable. Next.js inlines every
 * `NEXT_PUBLIC_*` reference at build time into both the server bundle *and* the
 * client bundle, so a key read through that prefix is shipped to every browser
 * and is extractable from the (public) container image. That is exactly how the
 * previous key ended up publicly harvestable between 2026-06-15 and 2026-08-11.
 *
 * Split of responsibilities:
 *   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — browser key. HTTP-referrer restricted
 *     to the hust hostnames, API-restricted to Maps JavaScript + Places.
 *     Baked at build time; public by design.
 *   - `GOOGLE_MAPS_SERVER_KEY` — server key. IP-restricted to the cluster egress
 *     address, API-restricted to Geocoding only. Injected at RUNTIME via
 *     `hust-app-secret` (OpenBao `kv/ever-hust/app-<env>`). Never inlined.
 *
 * Returns `undefined` when unset so callers can degrade gracefully.
 */
export function mapsServerKey(): string | undefined {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  return key && key.length > 0 ? key : undefined;
}
