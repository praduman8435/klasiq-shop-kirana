import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Phase 3.7 Part 3 — `addToBasket`/`setBasketItemQuantity` had NO direct
// integration test anywhere in this codebase before this part (only the
// pure clamp-math functions they call were tested, in basket-math.test.ts).
// Given this is the one and only Server Action the entire Product Detail
// "Add to Bag" flow depends on, and the brief explicitly asks for
// price/quantity/variant-tampering coverage against it, this closes that
// gap directly rather than assuming the existing math tests were enough.
// Same cookie-mocking shape as every other test in this codebase
// (src/lib/__tests__/basket.test.ts).
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addToBasket, removeBasketItem, setBasketItemQuantity, setVariantQuantity } from "@/server/actions/basket";

let categoryId: string;
const createdProductIds: string[] = [];
const createdBasketIds: string[] = [];

beforeEach(() => {
  store.clear();
});

// The cookie holds `Basket.accessToken` (Phase 3.7 Part 4), never
// `Basket.id` directly — every place this test file needs the real
// internal id (to query `BasketItem.basketId`, a genuine FK) resolves
// it via this helper, exactly like `getBasketId()` itself does
// internally now.
async function getCurrentBasketId(): Promise<string> {
  const token = store.get("shop_basket_id")!;
  const basket = await db.basket.findUniqueOrThrow({ where: { accessToken: token } });
  return basket.id;
}

afterEach(async () => {
  const token = store.get("shop_basket_id");
  if (token) {
    const basket = await db.basket.findUnique({ where: { accessToken: token } });
    if (basket) createdBasketIds.push(basket.id);
  }
});

afterAll(async () => {
  if (createdBasketIds.length) {
    await db.basketItem.deleteMany({ where: { basketId: { in: createdBasketIds } } });
    await db.basket.deleteMany({ where: { id: { in: createdBasketIds } } });
  }
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createVariant(params: {
  priceInPaise?: number;
  stockQuantity?: number;
  stockStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  variantIsActive?: boolean;
  productIsActive?: boolean;
} = {}) {
  if (!categoryId) {
    const category = await db.category.create({
      data: { slug: `test-basket-action-${randomUUID().slice(0, 8)}`, name: "Test Category" },
    });
    categoryId = category.id;
  }
  const suffix = randomUUID().slice(0, 10);
  const product = await db.product.create({
    data: {
      slug: `test-product-${suffix}`,
      name: "Test Product",
      categoryId,
      isActive: params.productIsActive ?? true,
      variants: {
        create: [
          {
            size: "M",
            sku: `TEST-SKU-${suffix}`,
            priceInPaise: params.priceInPaise ?? 50000,
            stockQuantity: params.stockQuantity ?? 5,
            stockStatus: params.stockStatus ?? "IN_STOCK",
            isActive: params.variantIsActive ?? true,
          },
        ],
      },
    },
    include: { variants: true },
  });
  createdProductIds.push(product.id);
  return product.variants[0]!;
}

describe("addToBasket — Phase 3.7 Part 3 adversarial coverage", () => {
  it("adds a fresh item using the variant's OWN authoritative price, never a client-supplied one", async () => {
    const variant = await createVariant({ priceInPaise: 42000 });

    // Scenario D — a client submitting an unexpected extra field (price/
    // line total) must have zero effect: the schema doesn't even declare
    // these fields, so zod strips them before this ever reaches the
    // domain logic, and the actual write always reads `variant.priceInPaise`
    // fresh from the database.
    const result = await addToBasket({
      productVariantId: variant.id,
      quantity: 2,
      priceInPaise: 1,
      lineTotalInPaise: 1,
    } as unknown);
    expect(result.success).toBe(true);

    const basketId = await getCurrentBasketId();
    const item = await db.basketItem.findFirstOrThrow({ where: { basketId, productVariantId: variant.id } });
    expect(item.priceInPaiseAtAdd).toBe(42000);
    expect(item.quantity).toBe(2);
  });

  it("rejects a nonexistent variant id cleanly, without crashing", async () => {
    const result = await addToBasket({ productVariantId: `does-not-exist-${randomUUID()}`, quantity: 1 });
    expect(result).toEqual({ success: false, message: "That item no longer exists." });
  });

  it("rejects an out-of-stock variant", async () => {
    const variant = await createVariant({ stockStatus: "OUT_OF_STOCK", stockQuantity: 0 });
    const result = await addToBasket({ productVariantId: variant.id, quantity: 1 });
    expect(result).toEqual({ success: false, message: "That pack size is currently out of stock." });
  });

  // Phase 3.7 Part 4 — Scenarios C/D. Before this fix, only `stockStatus`
  // was checked here; a deactivated variant/product (stockStatus is an
  // independent field, untouched by deactivation) could still be added.
  it("Scenario C — rejects a deactivated variant, even though it still reports IN_STOCK", async () => {
    const variant = await createVariant({ variantIsActive: false, stockStatus: "IN_STOCK" });
    const result = await addToBasket({ productVariantId: variant.id, quantity: 1 });
    expect(result).toEqual({ success: false, message: "That item is no longer available." });
  });

  it("Scenario D — rejects a variant whose PARENT PRODUCT was deactivated, even though the variant itself still reports IN_STOCK", async () => {
    const variant = await createVariant({ productIsActive: false, stockStatus: "IN_STOCK" });
    const result = await addToBasket({ productVariantId: variant.id, quantity: 1 });
    expect(result).toEqual({ success: false, message: "That item is no longer available." });
  });

  it("Scenario C — a tampered/unrelated variant id belonging to no product is rejected, never silently substituted", async () => {
    // addToBasket takes ONLY productVariantId — there is no separate
    // productId a client could mismatch it against, so the only possible
    // tamper is submitting an id that resolves to nothing (covered above)
    // or to a REAL variant the server then re-resolves entirely on its
    // own terms (this test) — never a fabricated product/variant pairing.
    const variant = await createVariant({ priceInPaise: 77700 });
    const result = await addToBasket({ productVariantId: variant.id, quantity: 1 });
    expect(result.success).toBe(true);

    const basketId = await getCurrentBasketId();
    const item = await db.basketItem.findFirstOrThrow({ where: { basketId, productVariantId: variant.id } });
    expect(item.priceInPaiseAtAdd).toBe(77700);
  });

  it("Scenario E — rejects quantity 0", async () => {
    const variant = await createVariant();
    const result = await addToBasket({ productVariantId: variant.id, quantity: 0 });
    expect(result).toEqual({ success: false, message: "Invalid request." });
  });

  it("Scenario E — rejects a negative quantity", async () => {
    const variant = await createVariant();
    const result = await addToBasket({ productVariantId: variant.id, quantity: -3 });
    expect(result).toEqual({ success: false, message: "Invalid request." });
  });

  it("Scenario E — rejects a fractional quantity", async () => {
    const variant = await createVariant();
    const result = await addToBasket({ productVariantId: variant.id, quantity: 1.5 });
    expect(result).toEqual({ success: false, message: "Invalid request." });
  });

  it("Scenario E — rejects an excessively large quantity (beyond the per-line cap)", async () => {
    const variant = await createVariant({ stockQuantity: 999999 });
    const result = await addToBasket({ productVariantId: variant.id, quantity: 999999 });
    expect(result).toEqual({ success: false, message: "Invalid request." });
  });

  it("clamps quantity down to real stock rather than rejecting outright, when some headroom exists", async () => {
    const variant = await createVariant({ stockQuantity: 3 });
    const result = await addToBasket({ productVariantId: variant.id, quantity: 10 });
    expect(result.success).toBe(true);

    const basketId = await getCurrentBasketId();
    const item = await db.basketItem.findFirstOrThrow({ where: { basketId, productVariantId: variant.id } });
    expect(item.quantity).toBe(3);
  });

  it("Scenario A — inventory dropping to exactly the already-held quantity between page load and Add to Bag yields a clear failure, not a silent over-add", async () => {
    const variant = await createVariant({ stockQuantity: 2 });
    const first = await addToBasket({ productVariantId: variant.id, quantity: 2 });
    expect(first.success).toBe(true);

    // Simulates inventory having already been fully claimed by someone
    // else since the page was loaded — a second add for the same line
    // must not silently succeed with zero real quantity added.
    const second = await addToBasket({ productVariantId: variant.id, quantity: 1 });
    expect(second.success).toBe(false);
    expect(second.message).toMatch(/only 2 left/i);
  });
});

describe("setBasketItemQuantity — quantity tampering (Scenario E)", () => {
  it("rejects a negative quantity", async () => {
    const variant = await createVariant();
    await addToBasket({ productVariantId: variant.id, quantity: 1 });
    const basketId = await getCurrentBasketId();
    const item = await db.basketItem.findFirstOrThrow({ where: { basketId, productVariantId: variant.id } });

    const result = await setBasketItemQuantity({ basketItemId: item.id, quantity: -1 });
    expect(result).toEqual({ success: false, message: "Invalid request." });
  });

  it("rejects an excessively large quantity", async () => {
    const variant = await createVariant();
    await addToBasket({ productVariantId: variant.id, quantity: 1 });
    const basketId = await getCurrentBasketId();
    const item = await db.basketItem.findFirstOrThrow({ where: { basketId, productVariantId: variant.id } });

    const result = await setBasketItemQuantity({ basketItemId: item.id, quantity: 100000 });
    expect(result).toEqual({ success: false, message: "Invalid request." });
  });
});

describe("setBasketItemQuantity — Scenarios C/D (Phase 3.7 Part 4): deactivated after being added", () => {
  it("Scenario C — auto-removes a line whose variant was deactivated after it was added, with a clear message", async () => {
    const variant = await createVariant({ stockQuantity: 5 });
    await addToBasket({ productVariantId: variant.id, quantity: 2 });
    const basketId = await getCurrentBasketId();
    const item = await db.basketItem.findFirstOrThrow({ where: { basketId, productVariantId: variant.id } });

    // The admin deactivates the variant AFTER the customer already added
    // it — stockStatus is untouched, so only an isActive-aware check
    // catches this.
    await db.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });

    const result = await setBasketItemQuantity({ basketItemId: item.id, quantity: 3 });
    expect(result).toEqual({ success: false, message: "That pack size is no longer available and was removed." });
    expect(await db.basketItem.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("Scenario D — auto-removes a line whose PARENT PRODUCT was deactivated after it was added", async () => {
    const variant = await createVariant({ stockQuantity: 5 });
    await addToBasket({ productVariantId: variant.id, quantity: 1 });
    const basketId = await getCurrentBasketId();
    const item = await db.basketItem.findFirstOrThrow({ where: { basketId, productVariantId: variant.id } });

    await db.product.update({ where: { id: variant.productId }, data: { isActive: false } });

    const result = await setBasketItemQuantity({ basketItemId: item.id, quantity: 2 });
    expect(result).toEqual({ success: false, message: "That pack size is no longer available and was removed." });
    expect(await db.basketItem.findUnique({ where: { id: item.id } })).toBeNull();
  });
});

describe("Basket ownership isolation — cross-basket access (Phase 3.7 Part 4, section 18.16)", () => {
  it("rejects a basketItemId belonging to a DIFFERENT basket, for both setBasketItemQuantity and removeBasketItem", async () => {
    const variant = await createVariant({ stockQuantity: 5 });

    // "Basket A" (the store's current state).
    await addToBasket({ productVariantId: variant.id, quantity: 1 });
    const basketAId = await getCurrentBasketId();
    createdBasketIds.push(basketAId);
    const itemInA = await db.basketItem.findFirstOrThrow({ where: { basketId: basketAId, productVariantId: variant.id } });

    // Switch to a fresh "Basket B" — a different cookie entirely,
    // simulating a different customer/browser.
    store.clear();
    await addToBasket({ productVariantId: variant.id, quantity: 1 });
    createdBasketIds.push(await getCurrentBasketId());

    // Basket B's active session must never be able to touch Basket A's item.
    const quantityResult = await setBasketItemQuantity({ basketItemId: itemInA.id, quantity: 2 });
    expect(quantityResult).toEqual({ success: false, message: "That item is not in your bag." });

    const removeResult = await removeBasketItem({ basketItemId: itemInA.id });
    expect(removeResult).toEqual({ success: false, message: "That item is not in your bag." });

    // Basket A's item must still exist, completely untouched.
    const stillThere = await db.basketItem.findUnique({ where: { id: itemInA.id } });
    expect(stillThere?.quantity).toBe(1);
  });
});

describe("setVariantQuantity — the product-card stepper, keyed by variant id", () => {
  async function lineFor(variantId: string) {
    const basketId = await getCurrentBasketId();
    return db.basketItem.findUnique({
      where: { basketId_productVariantId: { basketId, productVariantId: variantId } },
    });
  }

  it("adds a variant that isn't in the bag yet, then sets its quantity, then removes it at 0", async () => {
    const variant = await createVariant({ stockQuantity: 5 });

    expect(await setVariantQuantity({ productVariantId: variant.id, quantity: 1 })).toEqual({ success: true });
    expect((await lineFor(variant.id))?.quantity).toBe(1);

    expect(await setVariantQuantity({ productVariantId: variant.id, quantity: 3 })).toEqual({ success: true });
    expect((await lineFor(variant.id))?.quantity).toBe(3);

    expect(await setVariantQuantity({ productVariantId: variant.id, quantity: 0 })).toEqual({ success: true });
    expect(await lineFor(variant.id)).toBeNull();
  });

  it("clamps to stock exactly like setBasketItemQuantity, never trusting the requested number", async () => {
    const variant = await createVariant({ stockQuantity: 2 });
    await setVariantQuantity({ productVariantId: variant.id, quantity: 1 });

    const result = await setVariantQuantity({ productVariantId: variant.id, quantity: 9 });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Only 2 left/);
    expect((await lineFor(variant.id))?.quantity).toBe(2);
  });

  it("is a no-op success when asked to set 0 for a variant that isn't in the bag", async () => {
    const variant = await createVariant({ stockQuantity: 5 });
    expect(await setVariantQuantity({ productVariantId: variant.id, quantity: 0 })).toEqual({ success: true });
  });

  it("refuses an out-of-stock variant through the same addToBasket guard", async () => {
    const variant = await createVariant({ stockQuantity: 0, stockStatus: "OUT_OF_STOCK" });
    const result = await setVariantQuantity({ productVariantId: variant.id, quantity: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative or over-limit quantity at validation", async () => {
    const variant = await createVariant({ stockQuantity: 5 });
    expect((await setVariantQuantity({ productVariantId: variant.id, quantity: -1 })).success).toBe(false);
    expect((await setVariantQuantity({ productVariantId: variant.id, quantity: 999 })).success).toBe(false);
  });
});
