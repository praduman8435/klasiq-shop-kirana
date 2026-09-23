import { describe, expect, it } from "vitest";
import {
  addLineToCart,
  addRecentSchool,
  computeCartTotals,
  detectCreateFormPrefill,
  getCounterSaleSubmitGate,
  nextSearchResultIndex,
  removeLineFromCart,
  updateLineQuantity,
  validateCartForSubmission,
  validateCounterSaleCustomerSelection,
  type CounterSaleCartLine,
} from "@/lib/counter-sale-form";

function line(overrides: Partial<CounterSaleCartLine> = {}): CounterSaleCartLine {
  return {
    variantId: "v1",
    productName: "Test Shirt",
    size: "M",
    sku: "SKU-1",
    priceInPaise: 10000,
    quantity: 1,
    stockQuantity: 10,
    ...overrides,
  };
}

function itemInput(
  overrides: Partial<Omit<CounterSaleCartLine, "quantity">> = {},
): Omit<CounterSaleCartLine, "quantity"> {
  const full = line(overrides);
  return {
    variantId: full.variantId,
    productName: full.productName,
    size: full.size,
    sku: full.sku,
    priceInPaise: full.priceInPaise,
    stockQuantity: full.stockQuantity,
  };
}

describe("addLineToCart", () => {
  it("adds a new item with quantity 1", () => {
    const result = addLineToCart([], itemInput());
    expect(result).toHaveLength(1);
    expect(result[0]?.quantity).toBe(1);
  });

  it("increments an existing line instead of duplicating it", () => {
    const cart = [line({ quantity: 2 })];
    const result = addLineToCart(cart, itemInput());
    expect(result).toHaveLength(1);
    expect(result[0]?.quantity).toBe(3);
  });

  it("never exceeds available stock, even across repeated adds", () => {
    let cart: CounterSaleCartLine[] = [];
    const item = itemInput({ stockQuantity: 2 });
    cart = addLineToCart(cart, item);
    cart = addLineToCart(cart, item);
    cart = addLineToCart(cart, item);
    expect(cart[0]?.quantity).toBe(2);
  });

  it("does not add an out-of-stock item", () => {
    const result = addLineToCart([], itemInput({ stockQuantity: 0 }));
    expect(result).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const cart = [line()];
    const copy = [...cart];
    addLineToCart(cart, itemInput({ variantId: "v2" }));
    expect(cart).toEqual(copy);
  });
});

describe("updateLineQuantity", () => {
  it("increases quantity within stock", () => {
    const result = updateLineQuantity([line({ quantity: 1, stockQuantity: 5 })], "v1", 1);
    expect(result[0]?.quantity).toBe(2);
  });

  it("never exceeds stock on a large positive delta", () => {
    const result = updateLineQuantity([line({ quantity: 1, stockQuantity: 3 })], "v1", 10);
    expect(result[0]?.quantity).toBe(3);
  });

  it("removes the line entirely once quantity reaches zero", () => {
    const result = updateLineQuantity([line({ quantity: 1 })], "v1", -1);
    expect(result).toEqual([]);
  });

  it("never goes negative", () => {
    const result = updateLineQuantity([line({ quantity: 1 })], "v1", -5);
    expect(result).toEqual([]);
  });

  it("leaves other lines untouched", () => {
    const cart = [line({ variantId: "v1", quantity: 1 }), line({ variantId: "v2", quantity: 4 })];
    const result = updateLineQuantity(cart, "v1", 1);
    expect(result.find((l) => l.variantId === "v2")?.quantity).toBe(4);
  });
});

describe("removeLineFromCart", () => {
  it("removes only the targeted line", () => {
    const cart = [line({ variantId: "v1" }), line({ variantId: "v2" })];
    const result = removeLineFromCart(cart, "v1");
    expect(result).toHaveLength(1);
    expect(result[0]?.variantId).toBe("v2");
  });
});

describe("computeCartTotals", () => {
  it("sums line count, total quantity, and subtotal independently", () => {
    const cart = [
      line({ variantId: "v1", quantity: 2, priceInPaise: 10000 }),
      line({ variantId: "v2", quantity: 3, priceInPaise: 5000 }),
    ];
    expect(computeCartTotals(cart)).toEqual({
      lineCount: 2,
      totalQuantity: 5,
      subtotalInPaise: 35000,
    });
  });

  it("returns zeros for an empty cart", () => {
    expect(computeCartTotals([])).toEqual({ lineCount: 0, totalQuantity: 0, subtotalInPaise: 0 });
  });
});

describe("validateCartForSubmission", () => {
  it("rejects an empty cart", () => {
    expect(validateCartForSubmission([])?.type).toBe("EMPTY_CART");
  });

  it("rejects a zero-quantity line", () => {
    expect(validateCartForSubmission([line({ quantity: 0 })])?.type).toBe("ZERO_QUANTITY");
  });

  it("rejects a line requesting more than last-known stock", () => {
    expect(validateCartForSubmission([line({ quantity: 5, stockQuantity: 2 })])?.type).toBe(
      "OVER_STOCK",
    );
  });

  it("passes a valid cart", () => {
    expect(validateCartForSubmission([line({ quantity: 2, stockQuantity: 5 })])).toBeNull();
  });
});

describe("validateCounterSaleCustomerSelection", () => {
  it("never blocks guest", () => {
    expect(validateCounterSaleCustomerSelection({ mode: "GUEST" })).toBeNull();
  });

  it("blocks customer mode with no selection", () => {
    expect(
      validateCounterSaleCustomerSelection({ mode: "CUSTOMER", selectedCustomerId: null }),
    ).not.toBeNull();
  });

  it("passes customer mode once a customer is selected", () => {
    expect(
      validateCounterSaleCustomerSelection({ mode: "CUSTOMER", selectedCustomerId: "c1" }),
    ).toBeNull();
  });
});

describe("detectCreateFormPrefill", () => {
  it("pre-fills phone for a digits-only query", () => {
    expect(detectCreateFormPrefill("9876543210")).toEqual({ name: "", phone: "9876543210" });
  });

  it("pre-fills phone for a query with common phone punctuation", () => {
    expect(detectCreateFormPrefill("+91 98765-43210")).toEqual({ name: "", phone: "+91 98765-43210" });
  });

  it("pre-fills name for a query containing letters", () => {
    expect(detectCreateFormPrefill("Priya Sharma")).toEqual({ name: "Priya Sharma", phone: "" });
  });

  it("pre-fills neither for a full Customer ID", () => {
    expect(detectCreateFormPrefill("KLQ-7A41K2")).toEqual({ name: "", phone: "" });
  });

  it("pre-fills neither for a partial Customer ID fragment", () => {
    expect(detectCreateFormPrefill("KLQ-7A4")).toEqual({ name: "", phone: "" });
  });

  it("pre-fills neither for an empty query", () => {
    expect(detectCreateFormPrefill("   ")).toEqual({ name: "", phone: "" });
  });
});

describe("getCounterSaleSubmitGate — duplicate-click prevention and validation", () => {
  const validCart = [line()]; // priceInPaise 10000, quantity 1 -> subtotal 10000
  const guestCustomer = { mode: "GUEST" as const };

  it("allows submission when everything is valid and not already submitting", () => {
    expect(
      getCounterSaleSubmitGate({
        isSubmitting: false,
        lines: validCart,
        customer: guestCustomer,
        discount: null,
        payment: { mode: "FULL" },
      }),
    ).toEqual({ blocked: false });
  });

  it("blocks a second submission while one is already in flight", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: true,
      lines: validCart,
      customer: guestCustomer,
      discount: null,
      payment: { mode: "FULL" },
    });
    expect(result.blocked).toBe(true);
  });

  it("the in-flight guard wins even if the cart is also invalid", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: true,
      lines: [],
      customer: guestCustomer,
      discount: null,
      payment: { mode: "FULL" },
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.message).toContain("already being submitted");
  });

  it("blocks an empty cart when not submitting", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: [],
      customer: guestCustomer,
      discount: null,
      payment: { mode: "FULL" },
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.message).toContain("Add at least one item");
  });

  it("blocks an unresolved customer selection", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: { mode: "CUSTOMER", selectedCustomerId: null },
      discount: null,
      payment: { mode: "FULL" },
    });
    expect(result.blocked).toBe(true);
  });

  it("allows a valid flat discount that doesn't exceed the subtotal", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: guestCustomer,
      discount: { type: "FLAT", value: 5000 },
      payment: { mode: "FULL" },
    });
    expect(result).toEqual({ blocked: false });
  });

  it("blocks a flat discount that exceeds the cart's own subtotal", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: guestCustomer,
      discount: { type: "FLAT", value: 20000 },
      payment: { mode: "FULL" },
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.message).toContain("subtotal");
  });

  it("blocks an invalid percentage discount", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: guestCustomer,
      discount: { type: "PERCENTAGE", value: 150 },
      payment: { mode: "FULL" },
    });
    expect(result.blocked).toBe(true);
  });

  it("blocks a Partial Payment for a Guest sale (section 2)", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: guestCustomer,
      discount: null,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 5000 },
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.message).toContain("customer");
  });

  it("allows a Partial Payment once a Customer is attached", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: { mode: "CUSTOMER", selectedCustomerId: "c1" },
      discount: null,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 5000 },
    });
    expect(result).toEqual({ blocked: false });
  });

  it("blocks a Partial Payment amount that exceeds the Grand Total", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart, // subtotal 10000
      customer: { mode: "CUSTOMER", selectedCustomerId: "c1" },
      discount: null,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 10001 },
    });
    expect(result.blocked).toBe(true);
  });

  it("blocks a negative Partial Payment amount", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: { mode: "CUSTOMER", selectedCustomerId: "c1" },
      discount: null,
      payment: { mode: "PARTIAL", amountReceivedInPaise: -1 },
    });
    expect(result.blocked).toBe(true);
  });

  it("allows a zero-amount Partial Payment (full credit)", () => {
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: { mode: "CUSTOMER", selectedCustomerId: "c1" },
      discount: null,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 0 },
    });
    expect(result).toEqual({ blocked: false });
  });

  it("validates the Partial Payment amount against the DISCOUNTED Grand Total, not the Subtotal", () => {
    // subtotal 10000, 50% off -> Grand Total 5000; 6000 fits the Subtotal
    // but must still be blocked against the Grand Total.
    const result = getCounterSaleSubmitGate({
      isSubmitting: false,
      lines: validCart,
      customer: { mode: "CUSTOMER", selectedCustomerId: "c1" },
      discount: { type: "PERCENTAGE", value: 50 },
      payment: { mode: "PARTIAL", amountReceivedInPaise: 6000 },
    });
    expect(result.blocked).toBe(true);
  });
});

describe("nextSearchResultIndex", () => {
  it("moves from no selection to the first result on down", () => {
    expect(nextSearchResultIndex({ currentIndex: -1, resultCount: 3, direction: "down" })).toBe(0);
  });

  it("wraps from the last result back to the first on down", () => {
    expect(nextSearchResultIndex({ currentIndex: 2, resultCount: 3, direction: "down" })).toBe(0);
  });

  it("wraps from the first result back to the last on up", () => {
    expect(nextSearchResultIndex({ currentIndex: 0, resultCount: 3, direction: "up" })).toBe(2);
  });

  it("returns -1 when there are no results", () => {
    expect(nextSearchResultIndex({ currentIndex: -1, resultCount: 0, direction: "down" })).toBe(-1);
  });
});

describe("addRecentSchool", () => {
  it("adds a new school to the front", () => {
    const result = addRecentSchool([], { id: "s1", name: "School One" });
    expect(result).toEqual([{ id: "s1", name: "School One" }]);
  });

  it("moves an already-recent school to the front instead of duplicating it", () => {
    const recents = [
      { id: "s1", name: "School One" },
      { id: "s2", name: "School Two" },
    ];
    const result = addRecentSchool(recents, { id: "s2", name: "School Two" });
    expect(result).toEqual([
      { id: "s2", name: "School Two" },
      { id: "s1", name: "School One" },
    ]);
  });

  it("caps the list at 5 entries, dropping the oldest", () => {
    const recents = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, name: `School ${i}` }));
    const result = addRecentSchool(recents, { id: "s5", name: "School 5" });
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ id: "s5", name: "School 5" });
    expect(result.find((r) => r.id === "s4")).toBeUndefined();
  });
});
