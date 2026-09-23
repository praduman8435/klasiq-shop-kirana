import { hashSecret, verifySecretHash } from "@/lib/scrypt-hash";

/**
 * Thin, admin-domain-named wrapper over the shared scrypt hashing utility
 * (src/lib/scrypt-hash.ts) — kept as its own module so every existing
 * caller's import path and API are unchanged. See scrypt-hash.ts for the
 * actual hashing/verification implementation, also reused by customer OTP
 * digest storage (Phase 3.4).
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return hashSecret(plainPassword);
}

export async function verifyPassword(params: {
  plainPassword: string;
  storedHash: string;
}): Promise<boolean> {
  return verifySecretHash({ plainSecret: params.plainPassword, storedHash: params.storedHash });
}
