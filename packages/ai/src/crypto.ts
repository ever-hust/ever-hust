import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "everjobs-byok-v1"; // Static salt — key uniqueness comes from the env secret
const ITERATIONS = 100_000;

/**
 * Derive a 256-bit encryption key from the BYOK_ENCRYPTION_KEY env var.
 * Uses PBKDF2 with SHA-256 for key stretching.
 */
function getDerivedKey(): Buffer {
  const secret = process.env.BYOK_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "BYOK_ENCRYPTION_KEY environment variable is required for API key encryption"
    );
  }
  return pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LENGTH, "sha256");
}

/**
 * Encrypt an API key using AES-256-GCM.
 * Returns a string in the format: `iv:authTag:ciphertext` (all base64-encoded).
 */
export function encryptApiKey(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt an API key encrypted with `encryptApiKey()`.
 * Expects format: `iv:authTag:ciphertext` (base64-encoded parts).
 * Returns `null` if decryption fails (wrong key, tampered data, or plaintext input).
 */
export function decryptApiKey(encrypted: string): string | null {
  // If the value doesn't look encrypted (no colons), return as-is for backwards compat
  if (!encrypted.includes(":")) {
    return encrypted;
  }

  try {
    const key = getDerivedKey();
    const parts = encrypted.split(":");
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      return null; // Not in expected iv:tag:cipher format
    }
    const [ivB64, authTagB64, ciphertext] = parts;

    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    // Decryption failed — the value may be plaintext (pre-encryption migration)
    console.warn("[crypto] decryptApiKey failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Check if a string looks like an encrypted API key (has the iv:tag:cipher format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}
