import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null,
  }),
}));

import { getClientIp } from "@/lib/request-ip";

beforeEach(() => {
  requestHeaders.clear();
});

describe("getClientIp", () => {
  it("returns the first entry of a comma-separated x-forwarded-for chain", async () => {
    requestHeaders.set("x-forwarded-for", "203.0.113.5, 10.0.0.1, 10.0.0.2");
    expect(await getClientIp()).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    requestHeaders.set("x-real-ip", "203.0.113.9");
    expect(await getClientIp()).toBe("203.0.113.9");
  });

  it("returns a fixed placeholder when neither header is present", async () => {
    expect(await getClientIp()).toBe("unknown");
  });
});
