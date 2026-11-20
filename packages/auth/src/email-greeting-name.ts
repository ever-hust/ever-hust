/** Longest name the auth emails print after "Hi ". */
export const EMAIL_GREETING_NAME_MAX_LENGTH = 100;

/** Greeting used when the name cannot be trusted or is empty. */
const NEUTRAL_GREETING = "there";

/**
 * The name to put after "Hi " in the reset, verification and welcome emails.
 *
 * Sign-up accepts any name for an address that has no account yet, and the verification and
 * welcome emails go to that address before anyone has proved they own it. A name such as
 * "Your account is locked, restore it at attacker-site.example" would be sent from our own
 * sender, and mail clients turn the bare domain into a link. So an unverified user is greeted
 * as "there". A verified user gets their trimmed name, capped at 100 characters, or the local
 * part of their email when the name is blank (a blank name would print "Hi ,").
 */
export function emailGreetingName(user: {
  email: string;
  name?: string | null;
  emailVerified?: boolean | null;
}): string {
  if (user.emailVerified !== true) return NEUTRAL_GREETING;

  const name = user.name?.trim() || user.email.split("@")[0]?.trim();
  if (!name) return NEUTRAL_GREETING;

  // Cap by code point so an emoji or other astral character is never cut in half.
  const chars = Array.from(name);
  if (chars.length <= EMAIL_GREETING_NAME_MAX_LENGTH) return name;
  return chars.slice(0, EMAIL_GREETING_NAME_MAX_LENGTH).join("").trimEnd();
}
