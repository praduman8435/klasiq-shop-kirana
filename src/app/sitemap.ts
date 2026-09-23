import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const SITE_URL = "https://example.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Phase 3.6.7 Part 1 — every category is a real, working browse page
  // now (src/app/(site)/[categorySlug]/page.tsx), not just the four that
  // used to have their own hardcoded route file — so the sitemap lists
  // every category, not only ones shown in the header nav (a category
  // can be a genuine product-organizing page while deliberately hidden
  // from header navigation).
  const categories = await db.category.findMany({ select: { slug: true, updatedAt: true } });

  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...categories.map((category) => ({
      url: `${SITE_URL}/${category.slug}`,
      lastModified: category.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
