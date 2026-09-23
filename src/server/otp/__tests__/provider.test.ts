import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleOtpProvider, getOtpProvider } from "@/server/otp/provider";
import { WhatsAppOtpProvider } from "@/server/otp/whatsapp-provider";

// vi.stubEnv/unstubAllEnvs (not direct process.env assignment — NODE_ENV
// is typed read-only by @types/node) is the only way to genuinely
// exercise getOtpProvider()'s environment-based branching (section 3 of
// the Phase 3.6 Part 1 brief) rather than assuming it.

afterEach(() => {
  vi.unstubAllEnvs();
});

function setWhatsAppEnv() {
  vi.stubEnv("WHATSAPP_API_TOKEN", "test-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "klasiq_otp_verification");
}

describe("getOtpProvider — non-production", () => {
  it("defaults to ConsoleOtpProvider when OTP_PROVIDER is unset", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OTP_PROVIDER", "");

    expect(getOtpProvider()).toBeInstanceOf(ConsoleOtpProvider);
  });

  it("defaults to ConsoleOtpProvider for any OTP_PROVIDER value other than 'whatsapp'", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OTP_PROVIDER", "something-else");

    expect(getOtpProvider()).toBeInstanceOf(ConsoleOtpProvider);
  });

  it("switches to WhatsAppOtpProvider when OTP_PROVIDER=whatsapp and fully configured", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OTP_PROVIDER", "whatsapp");
    setWhatsAppEnv();

    expect(getOtpProvider()).toBeInstanceOf(WhatsAppOtpProvider);
  });

  it("is case-insensitive and trims whitespace on OTP_PROVIDER", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OTP_PROVIDER", "  WhatsApp  ");
    setWhatsAppEnv();

    expect(getOtpProvider()).toBeInstanceOf(WhatsAppOtpProvider);
  });

  it("throws a clear configuration error when OTP_PROVIDER=whatsapp but credentials are missing", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OTP_PROVIDER", "whatsapp");
    vi.stubEnv("WHATSAPP_API_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "");

    expect(() => getOtpProvider()).toThrow(/WHATSAPP_API_TOKEN/);
  });
});

describe("getOtpProvider — production", () => {
  it("always returns WhatsAppOtpProvider when configured, regardless of OTP_PROVIDER", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_PROVIDER", "console"); // must have NO effect in production
    setWhatsAppEnv();

    expect(getOtpProvider()).toBeInstanceOf(WhatsAppOtpProvider);
  });

  it("fails closed with a configuration error if WhatsApp credentials are missing — never falls back to console", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_API_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_OTP_TEMPLATE_NAME", "");

    expect(() => getOtpProvider()).toThrow(/WHATSAPP_API_TOKEN|WHATSAPP_PHONE_NUMBER_ID|WHATSAPP_OTP_TEMPLATE_NAME/);
  });
});

describe("ConsoleOtpProvider — defense in depth", () => {
  it("refuses to send even if directly constructed and called while NODE_ENV=production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const provider = new ConsoleOtpProvider();

    await expect(
      provider.sendOtp({ phoneNormalized: "+919876543210", code: "042817", purpose: "CUSTOMER_PORTAL_LOGIN" }),
    ).rejects.toThrow(/production/);
  });

  it("still works normally outside production — the development experience is unchanged", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const provider = new ConsoleOtpProvider();

    await expect(
      provider.sendOtp({ phoneNormalized: "+919876543210", code: "042817", purpose: "CUSTOMER_PORTAL_LOGIN" }),
    ).resolves.toBeUndefined();
  });
});
