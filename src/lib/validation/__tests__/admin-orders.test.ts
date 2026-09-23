import { describe, expect, it } from "vitest";
import { adminOrderFiltersSchema } from "@/lib/validation/admin-orders";

// Phase 3.2 Part 3: the only validation added to this schema (dateFrom/
// dateTo) gets a small, focused test — the rest of adminOrderFiltersSchema
// is exercised indirectly through src/server/queries/admin/__tests__/orders.test.ts.
describe("adminOrderFiltersSchema — date filters", () => {
  it("accepts well-formed YYYY-MM-DD dates", () => {
    const result = adminOrderFiltersSchema.safeParse({ dateFrom: "2026-06-01", dateTo: "2026-06-30" });
    expect(result.success).toBe(true);
  });

  it("accepts filters with no date bounds at all", () => {
    const result = adminOrderFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date string rather than silently accepting it", () => {
    const result = adminOrderFiltersSchema.safeParse({ dateFrom: "06/01/2026" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-date string", () => {
    const result = adminOrderFiltersSchema.safeParse({ dateTo: "not-a-date" });
    expect(result.success).toBe(false);
  });
});
