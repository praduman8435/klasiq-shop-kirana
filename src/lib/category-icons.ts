import {
  Backpack,
  Footprints,
  Shirt,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * The ONE shared slug→icon lookup for category imagery across the
 * storefront (product placeholder images, homepage category tiles). Kept
 * in a single place after Phase 3.7 Part 7's audit found the placeholder
 * image and the homepage tiles each keeping their own independent,
 * hardcoded map — both had drifted out of sync with the real category
 * slugs (`school-bags` lingered after the category was renamed to
 * `bags`; a newer `kurtis` category was in neither map), so an unmapped
 * category silently fell back to a generic shirt icon or, on the
 * homepage, vanished from the tile grid entirely. Matching by keyword
 * (not just an exact slug) means a category the admin renames or adds
 * later (see `docs/PHASE_3_6_7_REPORT.md` dynamic-category architecture)
 * still gets a reasonable icon without a code change, rather than only
 * ever working for a fixed, closed list of slugs.
 */
const CATEGORY_ICON_KEYWORDS: [pattern: RegExp, icon: LucideIcon][] = [
  [/shoe|footwear|sandal|sneaker/, Footprints],
  [/bag|backpack|trolley/, Backpack],
  [/sock/, Shirt],
  [/kurti|dress|ethnic/, Sparkles],
  [/uniform|shirt|pant|skirt|sweater|blazer|tie|belt/, Shirt],
];

/** Falls back to a generic shopping-bag icon for a category this list
 * doesn't recognize at all, rather than mislabeling it as a shirt. */
export function getCategoryIcon(categorySlugOrName: string): LucideIcon {
  const value = categorySlugOrName.toLowerCase();
  for (const [pattern, icon] of CATEGORY_ICON_KEYWORDS) {
    if (pattern.test(value)) return icon;
  }
  return ShoppingBag;
}
