import { describe, expect, it } from "vitest";
import { getOrderTotalQuantity, getPortalSourceLabel } from "@/lib/customer-portal/order-presentation";

describe("getPortalSourceLabel", () => {
  it("uses customer-friendly phrasing distinct from the admin badge labels", () => {
    expect(getPortalSourceLabel("ONLINE")).toBe("Online Order");
    expect(getPortalSourceLabel("COUNTER")).toBe("Purchased in Store");
  });
});

describe("getOrderTotalQuantity", () => {
  it("sums quantities across lines rather than counting product lines", () => {
    // 2 shirts + 3 pairs of socks reads as 5 items, not 2.
    const items = [{ quantity: 2 }, { quantity: 3 }];
    expect(getOrderTotalQuantity(items)).toBe(5);
  });

  it("returns 0 for no items", () => {
    expect(getOrderTotalQuantity([])).toBe(0);
  });

  it("handles a single line correctly", () => {
    expect(getOrderTotalQuantity([{ quantity: 1 }])).toBe(1);
  });
});
