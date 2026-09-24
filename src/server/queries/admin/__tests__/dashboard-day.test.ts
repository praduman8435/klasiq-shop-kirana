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
