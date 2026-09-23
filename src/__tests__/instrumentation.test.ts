import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

// Pre-deployment hardening (2026-08-10) — proves the fail-fast startup
// check directly, without actually starting a server (see the file's own
// doc comment for why `instrumentation.ts` is the correct mechanism for
// this in this Next.js version).

beforeEach(() => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("register — env var validation", () => {
  it("does nothing outside the Node.js runtime, regardless of what's missing", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("DATABASE_URL", "");
    await expect(register()).resolves.toBeUndefined();
  });

  it("throws a clear, actionable error when DATABASE_URL is missing, in any environment", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    await expect(register()).rejects.toThrow(/DATABASE_URL/);
  });

  it("succeeds outside production with only DATABASE_URL set (WhatsApp vars not required)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db");
    vi.stubEnv("WHATSAPP_API_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "");
    await expect(register()).resolves.toBeUndefined();
  });

  it("throws listing every missing WhatsApp variable when NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@prod-host:5432/db?sslmode=require");
    vi.stubEnv("WHATSAPP_API_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "");

    await expect(register()).rejects.toThrow(
      /WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_OTP_TEMPLATE_NAME/,
    );
  });

  it("succeeds in production once every required variable is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@prod-host:5432/db?sslmode=require");
    vi.stubEnv("WHATSAPP_API_TOKEN", "real-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "klasiq_otp");
    await expect(register()).resolves.toBeUndefined();
  });

});

describe("register — TLS soft warning (never fatal)", () => {
  it("warns, but does not throw, when a non-local production DATABASE_URL has no TLS indicator", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@prod-host.example.com:5432/db");
    vi.stubEnv("WHATSAPP_API_TOKEN", "t");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "n");

    await expect(register()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/TLS/));
  });

  it("does not warn when the production DATABASE_URL includes sslmode=require", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@prod-host.example.com:5432/db?sslmode=require");
    vi.stubEnv("WHATSAPP_API_TOKEN", "t");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "n");

    await register();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn for a local/loopback DATABASE_URL even without a TLS parameter", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5433/db");
    vi.stubEnv("WHATSAPP_API_TOKEN", "t");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "n");

    await register();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
