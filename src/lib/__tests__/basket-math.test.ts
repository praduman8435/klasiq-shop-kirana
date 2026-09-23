import { describe, expect, it } from "vitest";
import {
  clampAddQuantity,
  clampSetQuantity,
  computeCheckoutBlockingIssues,
} from "@/lib/basket-math";

describe("clampAddQuantity", () => {
  it("adds normally when well within stock", () => {
    expect(
      clampAddQuantity({
        existingQuantity: 1,
        requestedQuantity: 2,
        stockQuantity: 10,
        maxPerLine: 20,
      }),
    ).toBe(3);
  });

  it("never exceeds stock on hand, even if the client requests more", () => {
    expect(
      clampAddQuantity({
        existingQuantity: 0,
        requestedQuantity: 999,
        stockQuantity: 4,
        maxPerLine: 20,
      }),
    ).toBe(4);
  });

  it("never exceeds stock even when adding to an existing line", () => {
    expect(
      clampAddQuantity({
        existingQuantity: 3,
        requestedQuantity: 5,
        stockQuantity: 4,
        maxPerLine: 20,
      }),
    ).toBe(4);
  });

  it("respects the per-line cap even when stock is plentiful", () => {
    expect(
      clampAddQuantity({
        existingQuantity: 0,
        requestedQuantity: 50,
        stockQuantity: 500,
        maxPerLine: 20,
      }),
    ).toBe(20);
  });

  it("returns 0 (no-op) when there is no stock at all", () => {
    expect(
      clampAddQuantity({
        existingQuantity: 0,
        requestedQuantity: 5,
        stockQuantity: 0,
        maxPerLine: 20,
      }),
    ).toBe(0);
  });
});

describe("clampSetQuantity", () => {
  it("clamps a directly-set quantity to stock on hand", () => {
    expect(
      clampSetQuantity({ requestedQuantity: 10, stockQuantity: 3, maxPerLine: 20 }),
    ).toBe(3);
  });

  it("clamps to the per-line cap", () => {
    expect(
      clampSetQuantity({ requestedQuantity: 30, stockQuantity: 100, maxPerLine: 20 }),
    ).toBe(20);
  });

  it("never returns negative quantities", () => {
    expect(
      clampSetQuantity({ requestedQuantity: -5, stockQuantity: 10, maxPerLine: 20 }),
    ).toBe(0);
  });
});

describe("computeCheckoutBlockingIssues", () => {
  const line = (
    overrides: Partial<Parameters<typeof computeCheckoutBlockingIssues>[0][number]> = {},
  ) => ({
    id: "item-1",
    quantity: 2,
    productVariant: {
      isActive: true,
      stockQuantity: 10,
      stockStatus: "IN_STOCK" as const,
      size: "M",
      product: { name: "Shirt", isActive: true },
    },
    ...overrides,
  });

  it("returns no issues for a perfectly normal, in-stock line", () => {
    expect(computeCheckoutBlockingIssues([line()])).toEqual([]);
  });

  it("flags a deactivated variant", () => {
    const issues = computeCheckoutBlockingIssues([
      line({ productVariant: { ...line().productVariant, isActive: false } }),
    ]);
    expect(issues).toEqual([
      { id: "item-1", label: "Shirt (M)", reason: "no longer available" },
    ]);
  });

  it("flags a deactivated product even if the variant itself is active", () => {
    const issues = computeCheckoutBlockingIssues([
      line({
        productVariant: {
          ...line().productVariant,
          product: { name: "Shirt", isActive: false },
        },
      }),
    ]);
    expect(issues).toEqual([
      { id: "item-1", label: "Shirt (M)", reason: "no longer available" },
    ]);
  });

  it("flags an out-of-stock variant", () => {
    const issues = computeCheckoutBlockingIssues([
      line({
        productVariant: {
          ...line().productVariant,
          stockStatus: "OUT_OF_STOCK",
          stockQuantity: 0,
        },
      }),
    ]);
    expect(issues).toEqual([
      { id: "item-1", label: "Shirt (M)", reason: "no longer available" },
    ]);
  });

  it("flags a quantity that exceeds available stock, distinct from full unavailability", () => {
    const issues = computeCheckoutBlockingIssues([
      line({ quantity: 5, productVariant: { ...line().productVariant, stockQuantity: 3 } }),
    ]);
    expect(issues).toEqual([
      {
        id: "item-1",
        label: "Shirt (M)",
        reason: "only 3 left in stock, but 5 are in your bag",
      },
    ]);
  });

  it("uses singular phrasing when only 1 unit remains", () => {
    const issues = computeCheckoutBlockingIssues([
      line({ quantity: 2, productVariant: { ...line().productVariant, stockQuantity: 1 } }),
    ]);
    expect(issues[0].reason).toBe("only 1 left in stock, but 2 are in your bag");
  });

  it("does not flag a line exactly at the stock limit", () => {
    const issues = computeCheckoutBlockingIssues([
      line({ quantity: 3, productVariant: { ...line().productVariant, stockQuantity: 3 } }),
    ]);
    expect(issues).toEqual([]);
  });

  it("collects issues across multiple lines, leaving healthy lines out", () => {
    const issues = computeCheckoutBlockingIssues([
      line({ id: "ok", quantity: 1 }),
      line({ id: "bad", productVariant: { ...line().productVariant, isActive: false } }),
    ]);
    expect(issues).toEqual([
      { id: "bad", label: "Shirt (M)", reason: "no longer available" },
    ]);
  });
});
