import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Constant-time comparison, mirroring the convention already established
 * for every other secret comparison in this codebase (src/lib/scrypt-hash.ts's
 * `verifySecretHash`) — a plain `===`/`!==` on a secret token leaks timing
 * information about how many leading bytes matched. Hashing both sides to a
 * fixed-length digest first also sidesteps `timingSafeEqual`'s own
 * requirement that both buffers be the same length (it throws otherwise),
 * which a variable-length, attacker-supplied token could otherwise violate.
 */
function safeTokenEqual(expected: string, actual: string): boolean {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
}

/**
 * Looks up an order for the public confirmation page. Both orderNumber
 * AND accessToken must match — the order number alone is guessable
 * (sequential-looking, human-readable) and must never be sufficient to
 * view someone else's name/mobile/address. See "Order lookup security" in
 * docs/PHASE_2_REPORT.md.
 */
export async function getOrderByNumberAndToken(orderNumber: string, accessToken: string) {
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      items: { orderBy: { id: "asc" } },
    },
  });

  if (!order || !safeTokenEqual(order.accessToken, accessToken)) return null;
  return order;
}
