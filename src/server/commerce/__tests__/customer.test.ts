import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  anonymizeCustomer,
  createCustomerInline,
  findOrCreateCustomerByPrimaryPhone,
  updateCustomerContactInfo,
} from "@/server/commerce/customer";
import { createCounterSale } from "@/server/commerce/counter-sale";

const createdCustomerIds: string[] = [];
const createdOrderIds: string[] = [];
const createdProductIds: string[] = [];
let categoryId: string | undefined;
let adminUserId: string | undefined;

afterAll(async () => {
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCustomerIds.length) {
    await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (adminUserId) await db.adminUser.delete({ where: { id: adminUserId } }).catch(() => {});
  if (categoryId) await db.category.delete({ where: { id: categoryId } }).catch(() => {});
  await db.$disconnect();
});

// Every test uses its own random 10-digit local number (first digit 6-9) so
// tests never collide with each other or with real-looking seeded data.
function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

describe("findOrCreateCustomerByPrimaryPhone", () => {
  it("creates a new customer for a phone never seen before", async () => {
    const phone = freshTestPhone();
    const result = await findOrCreateCustomerByPrimaryPhone({
      rawPhone: phone,
      displayName: "Test Parent",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.wasCreated).toBe(true);
    expect(result.customer.displayName).toBe("Test Parent");
    expect(result.customer.primaryPhoneNormalized).toBe(`+91${phone}`);
    expect(result.customer.customerId.startsWith("KLQ-")).toBe(true);
  });

  it("reuses the same customer for the same phone in a different format", async () => {
    const phone = freshTestPhone();
    const first = await findOrCreateCustomerByPrimaryPhone({
      rawPhone: phone,
      displayName: "Original Name",
    });
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdCustomerIds.push(first.customer.id);

    const differentlyFormatted = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
    const second = await findOrCreateCustomerByPrimaryPhone({
      rawPhone: differentlyFormatted,
      displayName: "A Different Typed Name",
    });
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.wasCreated).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.customerId).toBe(first.customer.customerId);
    // Reuse does not overwrite the existing display name as a side effect.
    expect(second.customer.displayName).toBe("Original Name");

    const totalMatching = await db.customer.count({
      where: { primaryPhoneNormalized: `+91${phone}` },
    });
    expect(totalMatching).toBe(1);
  });

  it("creates exactly one customer under a true concurrent race for the same new phone", async () => {
    const phone = freshTestPhone();
    const [a, b] = await Promise.all([
      findOrCreateCustomerByPrimaryPhone({ rawPhone: phone, displayName: "Racer A" }),
      findOrCreateCustomerByPrimaryPhone({ rawPhone: phone, displayName: "Racer B" }),
    ]);

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    if (!a.success || !b.success) return;
    createdCustomerIds.push(a.customer.id);

    expect(a.customer.id).toBe(b.customer.id);
    // Exactly one of the two calls actually created the row.
    expect([a.wasCreated, b.wasCreated].filter(Boolean)).toHaveLength(1);

    const totalMatching = await db.customer.count({
      where: { primaryPhoneNormalized: `+91${phone}` },
    });
    expect(totalMatching).toBe(1);
  });

  it("rejects an invalid phone number without creating anything", async () => {
    const before = await db.customer.count();
    const result = await findOrCreateCustomerByPrimaryPhone({ rawPhone: "12345" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_PHONE");
    const after = await db.customer.count();
    expect(after).toBe(before);
  });
});

describe("updateCustomerContactInfo", () => {
  it("updates displayName without changing customerId or primaryPhone", async () => {
    const phone = freshTestPhone();
    const created = await findOrCreateCustomerByPrimaryPhone({ rawPhone: phone });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdCustomerIds.push(created.customer.id);

    const result = await updateCustomerContactInfo({
      id: created.customer.id,
      displayName: "Updated Name",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.customer.customerId).toBe(created.customer.customerId);
    expect(result.customer.displayName).toBe("Updated Name");
    expect(result.customer.primaryPhoneNormalized).toBe(`+91${phone}`);
  });

  it("updates primaryPhone to a new, unclaimed number", async () => {
    const phone = freshTestPhone();
    const newPhone = freshTestPhone();
    const created = await findOrCreateCustomerByPrimaryPhone({ rawPhone: phone });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdCustomerIds.push(created.customer.id);

    const result = await updateCustomerContactInfo({
      id: created.customer.id,
      primaryPhone: newPhone,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.customer.primaryPhoneNormalized).toBe(`+91${newPhone}`);
    expect(result.customer.customerId).toBe(created.customer.customerId);
  });

  it("refuses to move primaryPhone onto a number already claimed by a different customer", async () => {
    const phoneA = freshTestPhone();
    const phoneB = freshTestPhone();
    const customerA = await findOrCreateCustomerByPrimaryPhone({ rawPhone: phoneA });
    const customerB = await findOrCreateCustomerByPrimaryPhone({ rawPhone: phoneB });
    expect(customerA.success).toBe(true);
    expect(customerB.success).toBe(true);
    if (!customerA.success || !customerB.success) return;
    createdCustomerIds.push(customerA.customer.id, customerB.customer.id);

    const result = await updateCustomerContactInfo({
      id: customerA.customer.id,
      primaryPhone: phoneB,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PHONE_IN_USE");

    const untouched = await db.customer.findUniqueOrThrow({ where: { id: customerA.customer.id } });
    expect(untouched.primaryPhoneNormalized).toBe(`+91${phoneA}`);
  });

  it("returns NOT_FOUND for an unknown customer id", async () => {
    const result = await updateCustomerContactInfo({ id: "does-not-exist", displayName: "X" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
  });

  it("rejects an invalid new primary phone without changing the existing one", async () => {
    const phone = freshTestPhone();
    const created = await findOrCreateCustomerByPrimaryPhone({ rawPhone: phone });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdCustomerIds.push(created.customer.id);

    const result = await updateCustomerContactInfo({
      id: created.customer.id,
      primaryPhone: "not-a-phone",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_PHONE");

    const untouched = await db.customer.findUniqueOrThrow({ where: { id: created.customer.id } });
    expect(untouched.primaryPhoneNormalized).toBe(`+91${phone}`);
  });
});

describe("createCustomerInline", () => {
  it("creates a brand-new customer with name, phone, and WhatsApp number", async () => {
    const phone = freshTestPhone();
    const whatsapp = freshTestPhone();
    const result = await createCustomerInline({
      displayName: "Inline Created Customer",
      primaryPhone: phone,
      whatsappPhone: whatsapp,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.displayName).toBe("Inline Created Customer");
    expect(result.customer.primaryPhoneNormalized).toBe(`+91${phone}`);
    expect(result.customer.whatsappPhoneNormalized).toBe(`+91${whatsapp}`);
  });

  it("creates a customer with no WhatsApp number when none is given", async () => {
    const phone = freshTestPhone();
    const result = await createCustomerInline({ primaryPhone: phone });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.whatsappPhoneNormalized).toBeNull();
  });

  it("reuses an existing customer for an already-known phone, never overwriting their name or WhatsApp number", async () => {
    const phone = freshTestPhone();
    const originalWhatsapp = freshTestPhone();
    const first = await createCustomerInline({
      displayName: "Original Name",
      primaryPhone: phone,
      whatsappPhone: originalWhatsapp,
    });
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdCustomerIds.push(first.customer.id);

    const second = await createCustomerInline({
      displayName: "A Different Typed Name",
      primaryPhone: phone,
      whatsappPhone: freshTestPhone(),
    });
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.displayName).toBe("Original Name");
    expect(second.customer.whatsappPhoneNormalized).toBe(`+91${originalWhatsapp}`);

    const totalMatching = await db.customer.count({ where: { primaryPhoneNormalized: `+91${phone}` } });
    expect(totalMatching).toBe(1);
  });

  it("rejects an invalid phone without creating anything", async () => {
    const before = await db.customer.count();
    const result = await createCustomerInline({ primaryPhone: "not-a-phone" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_PHONE");
    const after = await db.customer.count();
    expect(after).toBe(before);
  });

  it("still creates and selects the customer even when the optional WhatsApp number is malformed", async () => {
    const phone = freshTestPhone();
    const result = await createCustomerInline({ primaryPhone: phone, whatsappPhone: "not-a-phone" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.primaryPhoneNormalized).toBe(`+91${phone}`);
    expect(result.customer.whatsappPhoneNormalized).toBeNull();
  });

  // Phase 3.6.6 Part 1 section 4 — this IS the one and only path that
  // ever sets Customer.addressLine/addressCity/addressState/addressPincode.
  it("creates a brand-new customer with a saved address when one is given", async () => {
    const phone = freshTestPhone();
    const result = await createCustomerInline({
      displayName: "Inline Address Customer",
      primaryPhone: phone,
      address: { addressLine: "12 New Customer Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.addressLine).toBe("12 New Customer Road");
    expect(result.customer.addressCity).toBe("Pune");
    expect(result.customer.addressState).toBe("Maharashtra");
    expect(result.customer.addressPincode).toBe("411001");
  });

  it("creates a customer with no saved address when none is given (default, unchanged behaviour)", async () => {
    const phone = freshTestPhone();
    const result = await createCustomerInline({ primaryPhone: phone });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.addressLine).toBeNull();
    expect(result.customer.addressCity).toBeNull();
    expect(result.customer.addressState).toBeNull();
    expect(result.customer.addressPincode).toBeNull();
  });

  it("never applies an address to an already-existing customer matched by phone, even when one is given on the second call", async () => {
    const phone = freshTestPhone();
    const first = await createCustomerInline({
      displayName: "Existing Customer",
      primaryPhone: phone,
      address: { addressLine: "Original Address", city: "Pune", state: "Maharashtra", pincode: "411001" },
    });
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdCustomerIds.push(first.customer.id);

    const second = await createCustomerInline({
      primaryPhone: phone,
      address: { addressLine: "A Different Address", city: "Mumbai", state: "MH", pincode: "400001" },
    });
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.customer.id).toBe(first.customer.id);
    // The SECOND call's address is never applied — the customer already
    // existed, so its saved address (from genuine creation) is
    // untouched, exactly like displayName/whatsappPhone above.
    expect(second.customer.addressLine).toBe("Original Address");
    expect(second.customer.addressCity).toBe("Pune");
  });

  it("a partial address (only some fields given) is still saved correctly, with the rest null", async () => {
    const phone = freshTestPhone();
    const result = await createCustomerInline({
      primaryPhone: phone,
      address: { city: "Pune" },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.addressLine).toBeNull();
    expect(result.customer.addressCity).toBe("Pune");
    expect(result.customer.addressState).toBeNull();
    expect(result.customer.addressPincode).toBeNull();
  });
});

describe("anonymizeCustomer — personal-data audit (2026-08-10)", () => {
  it("returns NOT_FOUND for a nonexistent id", async () => {
    const result = await anonymizeCustomer(`does-not-exist-${randomUUID()}`);
    expect(result).toEqual({ success: false, error: { type: "NOT_FOUND", message: expect.any(String) } });
  });

  it("clears every profile field and marks the customer inactive, but keeps id/customerId", async () => {
    const phone = freshTestPhone();
    const created = await createCustomerInline({
      displayName: "Erase Me",
      primaryPhone: phone,
      whatsappPhone: phone,
      address: { addressLine: "1 Privacy Lane", city: "Pune", state: "MH", pincode: "411001" },
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdCustomerIds.push(created.customer.id);

    const result = await anonymizeCustomer(created.customer.id);
    expect(result).toEqual({ success: true });

    const after = await db.customer.findUniqueOrThrow({ where: { id: created.customer.id } });
    expect(after.id).toBe(created.customer.id);
    expect(after.customerId).toBe(created.customer.customerId);
    expect(after.displayName).toBeNull();
    expect(after.primaryPhone).toBeNull();
    expect(after.primaryPhoneNormalized).toBeNull();
    expect(after.whatsappPhone).toBeNull();
    expect(after.whatsappPhoneNormalized).toBeNull();
    expect(after.addressLine).toBeNull();
    expect(after.addressCity).toBeNull();
    expect(after.addressState).toBeNull();
    expect(after.addressPincode).toBeNull();
    expect(after.active).toBe(false);
  });

  it("is idempotent — calling it a second time on an already-anonymized customer is a harmless no-op", async () => {
    const phone = freshTestPhone();
    const created = await createCustomerInline({ displayName: "Erase Twice", primaryPhone: phone });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdCustomerIds.push(created.customer.id);

    const first = await anonymizeCustomer(created.customer.id);
    const second = await anonymizeCustomer(created.customer.id);
    expect(first).toEqual({ success: true });
    expect(second).toEqual({ success: true });

    const after = await db.customer.findUniqueOrThrow({ where: { id: created.customer.id } });
    expect(after.displayName).toBeNull();
    expect(after.active).toBe(false);
  });

  it("never touches a real, already-placed order's own customer snapshot (name/mobile) or its product assignment", async () => {
    if (!categoryId) {
      const category = await db.category.create({
        data: { slug: `test-anonymize-${randomUUID()}`, name: "Test Anonymize Category" },
      });
      categoryId = category.id;
    }
    if (!adminUserId) {
      const admin = await db.adminUser.create({
        data: { name: "Test Anonymize Admin", email: `test-anonymize-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
      });
      adminUserId = admin.id;
    }

    const phone = freshTestPhone();
    const created = await createCustomerInline({ displayName: "Real Order Customer", primaryPhone: phone });
    expect(created.success).toBe(true);
    if (!created.success) return;
    createdCustomerIds.push(created.customer.id);

    const product = await db.product.create({
      data: { slug: `test-anonymize-product-${randomUUID()}`, name: "Test Anonymize Product", categoryId },
    });
    createdProductIds.push(product.id);
    const variant = await db.productVariant.create({
      data: { productId: product.id, size: "M", sku: `TEST-ANON-${randomUUID()}`, priceInPaise: 30000, stockQuantity: 5 },
    });

    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: created.customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const orderBefore = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
    createdOrderIds.push(orderBefore.id);

    await anonymizeCustomer(created.customer.id);

    const orderAfter = await db.order.findUniqueOrThrow({ where: { id: orderBefore.id } });
    // The order's OWN point-in-time snapshot survives untouched — this is
    // the deliberate scope boundary anonymizeCustomer's own doc comment
    // describes: the live Customer profile is erased, past transaction
    // records are not.
    expect(orderAfter.customerName).toBe("Real Order Customer");
    expect(orderAfter.customerMobile).toBe(phone);
    expect(orderAfter.customerId).toBe(created.customer.id);
    expect(orderAfter.totalInPaise).toBe(orderBefore.totalInPaise);

    // Meanwhile the live profile really is gone.
    const customerAfter = await db.customer.findUniqueOrThrow({ where: { id: created.customer.id } });
    expect(customerAfter.displayName).toBeNull();
    expect(customerAfter.primaryPhone).toBeNull();
  });
});
