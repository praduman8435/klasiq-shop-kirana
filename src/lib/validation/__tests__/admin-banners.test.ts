import { describe, expect, it } from "vitest";
import {
  bannerDatesFromWindow,
  bannerFormSchema,
  bannerWindowFromDates,
} from "@/lib/validation/admin-banners";

function base(overrides: Record<string, unknown> = {}) {
  return { title: "Diwali sweets are here", tone: "RED", icon: "FESTIVAL", isActive: true, ...overrides };
}

describe("bannerFormSchema", () => {
  it("accepts a title-only banner and normalises empty optionals", () => {
    const result = bannerFormSchema.safeParse(base());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ body: "", ctaLabel: "", ctaHref: "", startsOn: null, endsOn: null });
    }
  });

  it("requires a title and caps its length", () => {
    expect(bannerFormSchema.safeParse(base({ title: "  " })).success).toBe(false);
    expect(bannerFormSchema.safeParse(base({ title: "x".repeat(61) })).success).toBe(false);
  });

  it("requires the button label and link together", () => {
    expect(bannerFormSchema.safeParse(base({ ctaLabel: "Shop now" })).success).toBe(false);
    expect(bannerFormSchema.safeParse(base({ ctaHref: "/snacks" })).success).toBe(false);
    expect(bannerFormSchema.safeParse(base({ ctaLabel: "Shop now", ctaHref: "/snacks" })).success).toBe(true);
  });

  it("only allows links to pages on this store", () => {
    const withHref = (ctaHref: string) => bannerFormSchema.safeParse(base({ ctaLabel: "Go", ctaHref })).success;
    expect(withHref("/search?q=atta")).toBe(true);
    expect(withHref("/#categories-heading")).toBe(true);
    expect(withHref("https://evil.example")).toBe(false);
    expect(withHref("//evil.example")).toBe(false);
    expect(withHref("javascript:alert(1)")).toBe(false);
    expect(withHref("/has space")).toBe(false);
  });

  it("rejects an end date before the start date, allows the same day", () => {
    expect(bannerFormSchema.safeParse(base({ startsOn: "2026-11-05", endsOn: "2026-11-01" })).success).toBe(false);
    expect(bannerFormSchema.safeParse(base({ startsOn: "2026-11-05", endsOn: "2026-11-05" })).success).toBe(true);
  });

  it("rejects unknown tones and icons", () => {
    expect(bannerFormSchema.safeParse(base({ tone: "BLUE" })).success).toBe(false);
    expect(bannerFormSchema.safeParse(base({ icon: "ROCKET" })).success).toBe(false);
  });
});

describe("banner schedule window (India time)", () => {
  it("starts at IST midnight of the start day and ends at IST midnight after the end day", () => {
    const { startsAt, endsAt } = bannerWindowFromDates("2026-11-01", "2026-11-05");
    expect(startsAt?.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(endsAt?.toISOString()).toBe("2026-11-05T18:30:00.000Z");
  });

  it("round-trips back to the same calendar dates for the edit form", () => {
    const { startsAt, endsAt } = bannerWindowFromDates("2026-11-01", "2026-11-05");
    expect(bannerDatesFromWindow(startsAt, endsAt)).toEqual({ startsOn: "2026-11-01", endsOn: "2026-11-05" });
    expect(bannerDatesFromWindow(null, null)).toEqual({ startsOn: "", endsOn: "" });
  });
});
