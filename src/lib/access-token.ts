import { randomBytes } from "node:crypto";

/**
 * An unguessable bearer token — 24 bytes of CSPRNG output, base64url-encoded
 * (32 chars, URL-safe, no padding). Shared by every "possess this random
 * value = you own this resource, no login required" boundary in this
 * codebase: `Order.accessToken` (a public order-confirmation link, see
 * "Order lookup security" in docs/PHASE_2_REPORT.md) and, since Phase 3.7
 * Part 4, `Basket.accessToken` (the basket cookie — see that field's own
 * doc comment in prisma/schema.prisma for why a plain `cuid()` primary key
 * was never high-entropy enough to serve this role by itself).
 */
export function generateAccessToken(): string {
  return randomBytes(24).toString("base64url");
}
