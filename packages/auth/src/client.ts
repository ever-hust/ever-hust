import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8443",
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  linkSocial,
  listAccounts,
} = authClient;
