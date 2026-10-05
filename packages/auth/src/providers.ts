/**
 * Social sign-in providers and the env vars each needs. A provider is only
 * registered with Better Auth (and only shown on the login page) when both its
 * client id and secret are set — otherwise its button fails with
 * CLIENT_ID_AND_SECRET_REQUIRED or redirects to the provider with an empty
 * client_id.
 */
export const SOCIAL_PROVIDERS = {
  linkedin: { clientId: "LINKEDIN_CLIENT_ID", clientSecret: "LINKEDIN_CLIENT_SECRET" },
  google: { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET" },
  github: { clientId: "GITHUB_CLIENT_ID", clientSecret: "GITHUB_CLIENT_SECRET" },
  facebook: { clientId: "FACEBOOK_CLIENT_ID", clientSecret: "FACEBOOK_CLIENT_SECRET" },
  twitter: { clientId: "TWITTER_CLIENT_ID", clientSecret: "TWITTER_CLIENT_SECRET" },
} as const;

export type SocialProviderId = keyof typeof SOCIAL_PROVIDERS;

export const SOCIAL_PROVIDER_IDS = Object.keys(SOCIAL_PROVIDERS) as SocialProviderId[];

/** Client credentials for a provider, or null when either is missing. */
export function getProviderCredentials(
  id: SocialProviderId,
  env: Record<string, string | undefined> = process.env,
): { clientId: string; clientSecret: string } | null {
  const clientId = env[SOCIAL_PROVIDERS[id].clientId]?.trim();
  const clientSecret = env[SOCIAL_PROVIDERS[id].clientSecret]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Providers with credentials configured, in login-page order. */
export function getEnabledSocialProviders(
  env: Record<string, string | undefined> = process.env,
): SocialProviderId[] {
  return SOCIAL_PROVIDER_IDS.filter((id) => getProviderCredentials(id, env) !== null);
}
