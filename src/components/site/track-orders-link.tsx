"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one genuine gap the header/nav audit found (brief section "TRACK
 * ORDERS" — "ensure active/current state works correctly"): the header
 * and mobile-drawer Track Orders links were plain `<Link>`s with no
 * active-state logic at all, unlike every category link (`CategoryNavLink`
 * already sets `aria-current`/an active class off `usePathname()`).
 * Mirrors that exact pattern, just with `startsWith` matching instead of
 * an exact slug match — Track Orders covers a whole route subtree
 * (`/track`, `/track/orders`, `/track/orders/[orderNumber]`, ...), not a
 * single page. One shared component so the header (a Server Component,
 * which cannot call `usePathname()` itself) and the mobile nav drawer
 * never define "what counts as active" twice.
 */
export function TrackOrdersLink({
  className,
  activeClassName,
  iconClassName = "size-4",
  onClick,
  children,
}: {
  className: string;
  activeClassName: string;
  iconClassName?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === "/track" || pathname.startsWith("/track/");

  return (
    <Link
      href="/track"
      aria-label="Track Orders"
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
      className={cn(className, isActive && activeClassName)}
    >
      <PackageSearch className={cn(iconClassName, "shrink-0")} aria-hidden />
      {children}
    </Link>
  );
}
