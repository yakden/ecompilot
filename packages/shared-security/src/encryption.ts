/**
 * AES-256-GCM encryption for PII data at rest.
 *
 * Wire format (base64-encoded):
 *   [12-byte IV][16-byte authTag][ciphertext]
 *
 * Keys MUST be 32 bytes (256 bits). Use `generateEncryptionKey()` to
 * produce a cryptographically random key.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12; // NIST-recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptionResult {
  /** Base64-encoded string: IV + authTag + ciphertext */
  encrypted: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertKeyLength(key: Buffer): void {
  if (key.length !== KEY_LENGTH) {
    throw new RangeError(
      `Encryption key must be exactly ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits). Received ${key.length} bytes.`,
    );
  }
}

/**
 * Normalises a key from various input formats to a Buffer.
 * Accepts:
 *  - Buffer (passed through)
 *  - hex string (64 characters)
 *  - base64 string
 */
function normalizeKey(key: string | Buffer): Buffer {
  if (Buffer.isBuffer(key)) {
    assertKeyLength(key);
    return key;
  }

  // Try hex first (64 hex chars = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    const buf = Buffer.from(key, "hex");
    assertKeyLength(buf);
    return buf;
  }

  // Fall back to base64
  const buf = Buffer.from(key, "base64");
  assertKeyLength(buf);
  return buf;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * @param plaintext  UTF-8 string to encrypt
 * @param key        32-byte key as Buffer, hex, or base64 string
 * @returns base64 string containing IV + authTag + ciphertext
 */
export function encrypt(plaintext: string, key: string | Buffer): string {
  const keyBuf = normalizeKey(key);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, keyBuf, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: IV (12) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, ciphertext]);
  return packed.toString("base64");
}

/**
 * Decrypt a value produced by `encrypt()`.
 *
 * @param encrypted  base64 string (IV + authTag + ciphertext)
 * @param key        32-byte key as Buffer, hex, or base64 string
 * @returns original plaintext UTF-8 string
 * @throws if decryption fails (wrong key, tampered data, etc.)
 */
export function decrypt(encrypted: string, key: string | Buffer): string {
  const keyBuf = normalizeKey(key);
  const packed = Buffer.from(encrypted, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new RangeError(
      "Encrypted payload is too short to contain IV + authTag + ciphertext.",
    );
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

/**
 * Generate a cryptographically random 256-bit encryption key.
 *
 * @param encoding  Output encoding (default `"hex"`)
 */
export function generateEncryptionKey(
  encoding: "hex" | "base64" = "hex",
): string {
  return randomBytes(KEY_LENGTH).toString(encoding);
}

/**
 * Constant-time comparison of two encryption keys to prevent timing attacks.
 */
export function keysEqual(
  a: string | Buffer,
  b: string | Buffer,
): boolean {
  const bufA = normalizeKey(a);
  const bufB = normalizeKey(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * Re-encrypt a value under a new key.  Useful during key rotation.
 */
export function reEncrypt(
  encrypted: string,
  oldKey: string | Buffer,
  newKey: string | Buffer,
): string {
  const plaintext = decrypt(encrypted, oldKey);
  return encrypt(plaintext, newKey);
}
