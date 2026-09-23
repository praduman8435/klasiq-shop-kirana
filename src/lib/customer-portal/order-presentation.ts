import type { OrderSource } from "@prisma/client";

/**
 * Customer-portal-specific phrasing for `Order.source` — deliberately
 * distinct from the admin badge's own labels ("Online"/"Counter Sale",
 * src/components/admin/order-status-badge.tsx), which are staff-facing
 * shorthand. A customer sees "Purchased in Store" rather than the
 * internal "Counter Sale" terminology. Centralized here (not a switch
 * statement repeated per page) — see docs/PHASE_3_4_REPORT.md Part 2
 * "Order source labels".
 */
export function getPortalSourceLabel(source: OrderSource): string {
  switch (source) {
    case "ONLINE":
      return "Online Order";
    case "COUNTER":
      return "Purchased in Store";
  }
}

/**
 * Total item COUNT for a customer-friendly "N items" summary — the sum of
 * every line's quantity, not the number of distinct product lines. Two
 * shirts + three pairs of socks reads as "5 items," matching how a
 * customer actually thinks about what they bought, not how the database
 * happens to group it into OrderItem rows. See docs/PHASE_3_4_REPORT.md
 * Part 2 "Order item count".
 */
export function getOrderTotalQuantity(items: { quantity: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
