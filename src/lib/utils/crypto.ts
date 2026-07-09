import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.OPENAI_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("OPENAI_KEY_ENCRYPTION_SECRET is not set");
  }
  // Hash the secret to a fixed 32-byte key regardless of the raw secret's length.
  return crypto.createHash("sha256").update(secret).digest();
}

/** Encrypts a plaintext string into a single base64 payload: iv + authTag + ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/** Decrypts a payload produced by {@link encryptSecret}. */
export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Builds a safe preview like "sk-...ab12" for display without exposing the full secret. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "••••••••";
  return `${plaintext.slice(0, 3)}...${plaintext.slice(-4)}`;
}

/**
 * Encrypts an arbitrary set of named credential fields (e.g. `{ apiKey }` or
 * `{ clientId, clientSecret }`) into a single opaque string. Lets one encrypted
 * column (`store_connections.api_key_encrypted`) hold whatever shape of
 * credentials each platform needs, without per-platform schema changes.
 */
export function encodeCredentials(fields: Record<string, string>): string {
  return encryptSecret(JSON.stringify(fields));
}

/** Decrypts a payload produced by {@link encodeCredentials}. */
export function decodeCredentials(payload: string): Record<string, string> {
  return JSON.parse(decryptSecret(payload)) as Record<string, string>;
}
