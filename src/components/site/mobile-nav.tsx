"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CategoryNavLink } from "@/components/site/category-nav-link";
import { SiteSearch } from "@/components/site/site-search";
import { TrackOrdersLink } from "@/components/site/track-orders-link";
import { getCategoryIcon } from "@/lib/category-icons";
import { isDarkRoute } from "@/components/site/route-theme-scope";
import { cn } from "@/lib/utils";

export function MobileNav({ categories }: { categories: { slug: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 md:hidden [&_svg:not([class*='size-'])]:size-5"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      {/* `Sheet`'s portal renders at `document.body` by default, outside
          `RouteThemeScope`'s `.dark`-scoped wrapper — so on a dark route
          this panel would otherwise always render in the light palette
          regardless of the page underneath it. Applying the same
          `isDarkRoute()` check used by `RouteThemeScope` directly here
          keeps one source of truth for "which routes are dark" while
          still rendering correctly wherever the portal actually lands. */}
      <SheetContent side="left" className={cn("w-[85vw] max-w-sm", isDarkRoute(pathname) && "dark")}>
        <SheetHeader>
          <SheetTitle className="text-left font-heading">Browse</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <SiteSearch size="compact" />
          <nav aria-label="Categories" className="flex flex-col gap-1">
            {categories.map((category) => (
              <CategoryNavLink
                key={category.slug}
                slug={category.slug}
                name={category.name}
                icon={getCategoryIcon(category.slug || category.name)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-muted"
                activeClassName="bg-muted"
              />
            ))}
          </nav>
          <div className="flex flex-col gap-1 border-t pt-4">
            <Link
              href="/search"
              onClick={() => setOpen(false)}
              aria-current={pathname === "/search" ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-muted",
                pathname === "/search" && "bg-muted",
              )}
            >
              <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden />
              Search Products
            </Link>
            <TrackOrdersLink
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-muted"
              activeClassName="bg-muted"
              iconClassName="size-4.5 text-muted-foreground"
            >
              Track Orders
            </TrackOrdersLink>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
