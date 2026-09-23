import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/**
 * Generic scrypt-based secret hashing — a proven, memory-hard KDF
 * (OWASP-acceptable alongside bcrypt/argon2), zero new dependencies.
 * Stored form is `salt:hash`, both hex-encoded. Shared by admin password
 * hashing (src/lib/admin/password.ts) and customer OTP digest storage
 * (src/server/customer-portal/otp.ts) — the memory-hard cost is exactly
 * what makes an OTP's small 6-digit search space meaningfully harder to
 * brute-force offline than a fast hash would, see
 * docs/PHASE_3_4_REPORT.md "OTP storage / threat model". Never store or
 * log the plaintext secret anywhere.
 */
export async function hashSecret(plainSecret: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = (await scrypt(plainSecret, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Constant-time comparison via timingSafeEqual — never a plain `===` on
 * derived key bytes, which would leak timing information about how many
 * leading bytes matched.
 */
export async function verifySecretHash(params: {
  plainSecret: string;
  storedHash: string;
}): Promise<boolean> {
  const { plainSecret, storedHash } = params;
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(plainSecret, salt, expected.length)) as Buffer;

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
