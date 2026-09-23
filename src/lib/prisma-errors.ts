import { Prisma } from "@prisma/client";

/**
 * True when `err` is a Prisma unique-constraint violation (P2002) on the
 * given field. Shared by every "pre-check, then guarded insert, then
 * recover on the race" flow in this codebase — see
 * src/server/commerce/place-order.ts (orderNumber/idempotencyKey) and
 * src/server/commerce/customer.ts (customerId/primaryPhoneNormalized) for
 * the pattern this backs.
 */
export function isUniqueConstraintErrorOn(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).includes(field)
  );
}
