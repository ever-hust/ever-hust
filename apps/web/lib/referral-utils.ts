import { randomBytes } from "crypto";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Generate a cryptographically random 6-character uppercase alphanumeric code. */
export function generateReferralCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CHARS[bytes[i]! % CHARS.length];
  }
  return code;
}
