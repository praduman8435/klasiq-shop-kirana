import {
  Backpack,
  Baby,
  Coffee,
  Cookie,
  Droplet,
  Egg,
  Flame,
  Milk,
  ShoppingBag,
  Soup,
  Sparkles,
  SprayCan,
  Wheat,
  type LucideIcon,
} from "lucide-react";

/**
 * The ONE shared slug→icon lookup for category imagery across the
 * storefront (product placeholder images, homepage category tiles), kept
 * in a single place so the two can never drift out of sync with the real
 * category slugs. Patterns are checked in order, first match wins — so
 * e.g. "Oil, Ghee & Masale" gets the oil icon. Matching by keyword
 * (not just an exact slug) means a category the admin renames or adds
 * later (see `docs/PHASE_3_6_7_REPORT.md` dynamic-category architecture)
 * still gets a reasonable icon without a code change, rather than only
 * ever working for a fixed, closed list of slugs.
 */
const CATEGORY_ICON_KEYWORDS: [pattern: RegExp, icon: LucideIcon][] = [
  [/atta|rice|dal|pulse|flour|grain|staple|poha|besan|sooji/, Wheat],
  [/oil|ghee/, Droplet],
  [/masala|masale|spice|salt|sugar/, Soup],
  [/dairy|milk|curd|paneer|butter|bread/, Milk],
  [/egg/, Egg],
  [/snack|biscuit|namkeen|chip|packaged|noodle|sweet/, Cookie],
  [/tea|coffee|drink|beverage|juice/, Coffee],
  [/personal|care|soap|shampoo|beauty|hygiene/, Sparkles],
  [/clean|household|detergent|home/, SprayCan],
  [/pooja|puja|agarbatti|diya/, Flame],
  [/baby/, Baby],
  [/bag|luggage/, Backpack],
];

/** Falls back to a generic shopping-bag icon for a category this list
 * doesn't recognize at all, rather than mislabeling it. */
export function getCategoryIcon(categorySlugOrName: string): LucideIcon {
  const value = categorySlugOrName.toLowerCase();
  for (const [pattern, icon] of CATEGORY_ICON_KEYWORDS) {
    if (pattern.test(value)) return icon;
  }
  return ShoppingBag;
}
