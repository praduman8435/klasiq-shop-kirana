import { db } from "@/lib/db";

/**
 * The homepage's banners: active, and inside their optional schedule
 * window (`startsAt` inclusive, `endsAt` exclusive), in admin order.
 * `now` is injectable so the schedule rule is directly testable.
 */
export async function getActivePromoBanners(now: Date = new Date()) {
  return db.promoBanner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Every banner, for /admin/banners — including hidden and expired ones. */
export async function getAllPromoBanners() {
  return db.promoBanner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export async function getPromoBannerById(id: string) {
  return db.promoBanner.findUnique({ where: { id } });
}
