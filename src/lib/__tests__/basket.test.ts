import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same shape as every other cookie-mocking test in this codebase — a real
// in-memory Map standing in for the browser's cookie jar, but this time
// also capturing the OPTIONS passed to `.set()` so this test can assert on
// httpOnly/secure/sameSite directly, not just presence/value.
const { store, setCalls } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  setCalls: [] as { name: string; value: string; options: Record<string, unknown> }[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      store.set(name, value);
      setCalls.push({ name, value, options });
    },
  }),
}));

import { BASKET_COOKIE_NAME, getBasketId, getOrCreateBasketId } from "@/lib/basket";

const createdBasketIds: string[] = [];

beforeEach(() => {
  store.clear();
  setCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  if (createdBasketIds.length) await db.basket.deleteMany({ where: { id: { in: createdBasketIds } } });
  await db.$disconnect();
});

describe("getOrCreateBasketId — cookie flags (personal-data audit, 2026-08-10)", () => {
  it("sets httpOnly and sameSite=lax unconditionally, and secure only in production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const id = await getOrCreateBasketId();
    createdBasketIds.push(id);

    const call = setCalls.find((c) => c.name === BASKET_COOKIE_NAME);
    expect(call).toBeDefined();
    expect(call!.options.httpOnly).toBe(true);
    expect(call!.options.sameSite).toBe("lax");
    // Was missing entirely before this audit — now explicitly false
    // outside production (matches the admin/customer session cookies'
    // own identical rule) rather than absent.
    expect(call!.options.secure).toBe(false);
  });

  it("sets secure=true when NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const id = await getOrCreateBasketId();
    createdBasketIds.push(id);

    const call = setCalls.find((c) => c.name === BASKET_COOKIE_NAME);
    expect(call!.options.secure).toBe(true);
  });

  it("reuses an existing ACTIVE basket rather than creating a second one, with no new cookie write", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const firstId = await getOrCreateBasketId();
    createdBasketIds.push(firstId);
    setCalls.length = 0;

    const secondId = await getOrCreateBasketId();
    expect(secondId).toBe(firstId);
    expect(setCalls).toHaveLength(0);
  });
});

describe("Basket identity — accessToken indirection (Phase 3.7 Part 4)", () => {
  // Section 3's explicit "Basket IDs are not trusted as authorization by
  // themselves" — verified directly, not just asserted in a comment.
  // Before this fix, the cookie held `Basket.id` (a plain cuid) itself;
  // now it holds a separate, unguessable `accessToken`
  // (src/lib/access-token.ts), mirroring the identical precedent already
  // established for `Order.accessToken`.
  it("the cookie value is never the same as the basket's real internal id", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const id = await getOrCreateBasketId();
    createdBasketIds.push(id);

    const cookieValue = store.get(BASKET_COOKIE_NAME);
    expect(cookieValue).toBeDefined();
    expect(cookieValue).not.toBe(id);
  });

  it("the cookie value has real cryptographic entropy (32-char base64url, matching generateAccessToken)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const id = await getOrCreateBasketId();
    createdBasketIds.push(id);

    const cookieValue = store.get(BASKET_COOKIE_NAME)!;
    expect(cookieValue).toHaveLength(32);
    expect(cookieValue).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("a real basket's own internal id, used as a guessed/tampered cookie value, resolves to nothing", async () => {
    // The exact attack this fix closes: an attacker who somehow learned
    // or guessed a real Basket.id (its cuid primary key — a far lower-
    // entropy, structured value than a real access token) and tried
    // presenting it as if it were the bearer token.
    vi.stubEnv("NODE_ENV", "test");
    const realId = await getOrCreateBasketId();
    createdBasketIds.push(realId);

    store.clear();
    store.set(BASKET_COOKIE_NAME, realId);

    expect(await getBasketId()).toBeNull();
  });

  it("getBasketId resolves the legitimate token to the correct real id", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const id = await getOrCreateBasketId();
    createdBasketIds.push(id);

    expect(await getBasketId()).toBe(id);
  });
});
