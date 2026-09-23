import { describe, expect, it } from "vitest";
import { bannerScheduleLabel, bannerStatus } from "@/lib/banner-status";

const now = new Date("2026-11-03T06:00:00Z");
const day = (iso: string) => new Date(iso);

describe("bannerStatus", () => {
  it("is hidden whenever the banner is switched off, schedule or not", () => {
    expect(bannerStatus({ isActive: false, startsAt: null, endsAt: null }, now)).toBe("hidden");
  });

  it("is live with no schedule, or inside its window", () => {
    expect(bannerStatus({ isActive: true, startsAt: null, endsAt: null }, now)).toBe("live");
    expect(bannerStatus({ isActive: true, startsAt: day("2026-11-01T00:00:00Z"), endsAt: day("2026-11-05T00:00:00Z") }, now)).toBe("live");
  });

  it("is scheduled before its start and ended at/after its (exclusive) end", () => {
    expect(bannerStatus({ isActive: true, startsAt: day("2026-11-04T00:00:00Z"), endsAt: null }, now)).toBe("scheduled");
    expect(bannerStatus({ isActive: true, startsAt: null, endsAt: now }, now)).toBe("ended");
  });
});

describe("bannerScheduleLabel", () => {
  it("shows the last visible day, not the exclusive end", () => {
    // Window for 1–5 Nov IST.
    const startsAt = day("2026-10-31T18:30:00Z");
    const endsAt = day("2026-11-05T18:30:00Z");
    expect(bannerScheduleLabel({ startsAt, endsAt })).toBe("1 Nov – 5 Nov");
    expect(bannerScheduleLabel({ startsAt: null, endsAt })).toBe("Until 5 Nov");
    expect(bannerScheduleLabel({ startsAt, endsAt: null })).toBe("From 1 Nov");
    expect(bannerScheduleLabel({ startsAt: null, endsAt: null })).toBeNull();
  });
});
