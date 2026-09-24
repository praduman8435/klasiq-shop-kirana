import { describe, expect, it } from "vitest";
import { startOfIndiaDay } from "@/server/queries/admin/dashboard";

describe("startOfIndiaDay", () => {
  it("starts 'today' at midnight India time, not server (UTC) midnight", () => {
    // 25 Sep 2026, 01:00 IST is still 24 Sep in UTC — it must count as the 25th.
    expect(startOfIndiaDay(new Date("2026-09-24T19:30:00Z")).toISOString()).toBe("2026-09-24T18:30:00.000Z");
    // 24 Sep 2026, 23:00 IST.
    expect(startOfIndiaDay(new Date("2026-09-24T17:30:00Z")).toISOString()).toBe("2026-09-23T18:30:00.000Z");
  });

  it("steps back whole India days", () => {
    expect(startOfIndiaDay(new Date("2026-09-24T19:30:00Z"), 6).toISOString()).toBe("2026-09-18T18:30:00.000Z");
  });
});

describe("getSalesSeries periods", async () => {
  const { getSalesSeries } = await import("@/server/queries/admin/dashboard");
  const now = new Date("2026-09-25T06:30:00Z"); // 25 Sep, noon in India

  it("week = 7 daily bars ending today, month = 30, year = 12 months", async () => {
    const week = await getSalesSeries({ range: "week" }, now);
    expect(week.points).toHaveLength(7);
    expect(week.points.at(-1)?.isCurrent).toBe(true);
    expect((await getSalesSeries({ range: "month" }, now)).points).toHaveLength(30);
    const year = await getSalesSeries({ range: "year" }, now);
    expect(year.unit).toBe("month");
    expect(year.points).toHaveLength(12);
    expect(year.points.at(-1)?.label).toBe("Sept");
  });

  it("custom uses days for short ranges, months for long ones, and falls back to week", async () => {
    expect((await getSalesSeries({ range: "custom", from: "2026-09-01", to: "2026-09-03" }, now)).points).toHaveLength(3);
    const long = await getSalesSeries({ range: "custom", from: "2026-01-01", to: "2026-06-30" }, now);
    expect(long.unit).toBe("month");
    expect(long.points).toHaveLength(6);
    expect((await getSalesSeries({ range: "custom", from: "2026-09-10", to: "2026-09-01" }, now)).range).toBe("week");
  });
});
