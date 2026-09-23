"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 3.6.7 Part 2, section 11 — the one genuine accessibility gap this
 * audit found: none of the desktop header, mobile nav, or footer category
 * links ever indicated the CURRENTLY viewed category (no `aria-current`,
 * no visual active state) — a real gap, not a redesign, since this
 * codebase already has an established active-link pattern to match
 * (`NavLinks` in src/components/admin/admin-shell.tsx, which sets
 * `aria-current={active ? "page" : undefined}` off `usePathname()`).
 *
 * A single shared component (not three separate `usePathname()` calls)
 * so "what counts as active" — an exact match against `/{slug}` — is
 * defined exactly once. `SiteHeader`/`SiteFooter` stay plain Server
 * Components; only this one link primitive needs to be a Client
 * Component (`usePathname()` requires it), exactly as targeted as
 * `MobileNav` already was for its own, unrelated (open/close) state.
 */
export function CategoryNavLink({
  slug,
  name,
  className,
  activeClassName,
  onClick,
  icon: Icon,
}: {
  slug: string;
  name: string;
  className: string;
  activeClassName: string;
  onClick?: () => void;
  /** Optional — the mobile nav drawer shows a category icon per row for a
   * more scannable list; the desktop header/footer text links pass
   * nothing and render exactly as before. */
  icon?: LucideIcon;
}) {
  const pathname = usePathname();
  const isActive = pathname === `/${slug}`;

  return (
    <Link
      href={`/${slug}`}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(className, isActive && activeClassName)}
    >
      {Icon && <Icon className="size-4.5 shrink-0 text-muted-foreground" aria-hidden />}
      {name}
    </Link>
  );
}
