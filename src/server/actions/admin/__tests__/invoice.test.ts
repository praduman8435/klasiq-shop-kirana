import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as returns.test.ts (Phase 3.5
// Part 2) and session.test.ts (Phase 3.4) — exercises the REAL
// getAdminSession()/createAdminSession() code, not a stubbed session
// object.
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (arg: string | { name: string }) => {
      store.delete(typeof arg === "string" ? arg : arg.name);
    },
  }),
}));

// Isolates authorization/wiring from the WhatsApp send's own internals
// (already fully covered by invoice-notification-service.test.ts and
// send-invoice.test.ts) — this file only proves the Server Action's own
// authorization gate.
vi.mock("@/server/commerce/send-invoice", () => ({
  sendInvoiceWhatsApp: vi.fn().mockResolvedValue({ success: true }),
}));

import { createAdminSession } from "@/lib/admin/session";
import { sendInvoiceWhatsAppAction } from "@/server/actions/admin/invoice";
import { sendInvoiceWhatsApp } from "@/server/commerce/send-invoice";

const mockedSendInvoiceWhatsApp = vi.mocked(sendInvoiceWhatsApp);

const createdAdminIds: string[] = [];

beforeEach(() => {
  store.clear();
  mockedSendInvoiceWhatsApp.mockClear();
  mockedSendInvoiceWhatsApp.mockResolvedValue({ success: true });
});

afterAll(async () => {
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.$disconnect();
});

async function signInAsAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Send Invoice Action Admin",
      email: `test-send-invoice-action-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  createdAdminIds.push(admin.id);
  await createAdminSession(admin.id);
}

describe("sendInvoiceWhatsAppAction — authorization (section 10)", () => {
  it("returns UNAUTHORIZED and never calls sendInvoiceWhatsApp when there is no admin session", async () => {
    const result = await sendInvoiceWhatsAppAction({ orderNumber: "ORD-TEST-1" });
    expect(result).toEqual({ success: false, error: { type: "UNAUTHORIZED", message: expect.any(String) } });
    expect(mockedSendInvoiceWhatsApp).not.toHaveBeenCalled();
  });

  it("delegates to sendInvoiceWhatsApp with the given order number when a real admin session exists", async () => {
    await signInAsAdmin();
    const result = await sendInvoiceWhatsAppAction({ orderNumber: "ORD-TEST-1" });
    expect(result).toEqual({ success: true });
    expect(mockedSendInvoiceWhatsApp).toHaveBeenCalledWith("ORD-TEST-1");
  });

  it("returns VALIDATION and never calls sendInvoiceWhatsApp for a malformed input", async () => {
    await signInAsAdmin();
    const result = await sendInvoiceWhatsAppAction({ orderNumber: "" });
    expect(result).toEqual({ success: false, error: { type: "VALIDATION", message: expect.any(String) } });
    expect(mockedSendInvoiceWhatsApp).not.toHaveBeenCalled();
  });

  it("passes through whatever result sendInvoiceWhatsApp returns, including a failure", async () => {
    await signInAsAdmin();
    mockedSendInvoiceWhatsApp.mockResolvedValue({ success: false, error: { type: "NO_PHONE", message: "No phone." } });
    const result = await sendInvoiceWhatsAppAction({ orderNumber: "ORD-TEST-1" });
    expect(result).toEqual({ success: false, error: { type: "NO_PHONE", message: "No phone." } });
  });
});
