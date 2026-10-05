/**
 * User-facing text for the `?error=` code Better Auth puts on the login URL
 * after a failed social sign-in (onAPIError.errorURL → /login).
 */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "unable_to_link_account":
      return "No account found with that email. Sign in with LinkedIn or email first, then connect other providers in Settings.";
    case "unable_to_create_user":
      return "We couldn't create your account with that provider. Please try again, or sign up with email below.";
    case "access_denied":
      return "Sign-in was cancelled.";
    case "state_mismatch":
    case "please_restart_the_process":
      return "Your sign-in session expired. Please try again.";
    case "account_not_linked":
      return "That account isn't linked to your Hust account yet. Sign in another way, then connect it in Settings.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
