"use client";

import { usePathname } from "next/navigation";

/**
 * The header's second, mobile-only row: search kept one tap away while
 * looking at a product. Only on Product Detail pages — the homepage,
 * category and search pages already lead with their own search box (two
 * stacked in one phone viewport reads as a mistake), and the bag/checkout
 * flow shouldn't invite a detour out of checkout.
 */
export function HeaderSearchRow({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/product/")) return null;

  return <div className="px-4 pb-3 md:hidden">{children}</div>;
}
