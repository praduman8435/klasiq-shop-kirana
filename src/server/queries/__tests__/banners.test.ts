import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getActivePromoBanners } from "@/server/queries/banners";

const createdIds: string[] = [];
const now = new Date("2026-11-03T06:00:00Z");

async function banner(data: { title: string; isActive?: boolean; startsAt?: Date; endsAt?: Date; sortOrder?: number }) {
  const created = await db.promoBanner.create({
    data: { title: data.title, isActive: data.isActive ?? true, startsAt: data.startsAt, endsAt: data.endsAt, sortOrder: data.sortOrder ?? 100 },
  });
  createdIds.push(created.id);
  return created;
}

afterAll(async () => {
  await db.promoBanner.deleteMany({ where: { id: { in: createdIds } } });
  await db.$disconnect();
});

describe("getActivePromoBanners", () => {
  it("returns only active banners inside their schedule window, in sortOrder", async () => {
    const tag = `t${Date.now()}`;
    const second = await banner({ title: `${tag} second`, sortOrder: 102 });
    const first = await banner({ title: `${tag} first`, sortOrder: 101, startsAt: new Date("2026-11-01"), endsAt: new Date("2026-11-05") });
    await banner({ title: `${tag} hidden`, isActive: false });
    await banner({ title: `${tag} future`, startsAt: new Date("2026-11-04") });
    await banner({ title: `${tag} ended`, endsAt: now });

    const titles = (await getActivePromoBanners(now)).map((b) => b.title).filter((t) => t.startsWith(tag));
    expect(titles).toEqual([first.title, second.title]);
  });
});
