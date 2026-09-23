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
      {/* `Sheet` portals to `document.body`, outside the `(site)`
          layout's `.store-theme` scope, so the panel re-applies it. */}
      <SheetContent side="left" className="store-theme w-[85vw] max-w-sm">
        <SheetHeader>
          <SheetTitle className="text-left font-heading text-xl font-extrabold">Aisles</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <SiteSearch size="compact" />
          <nav aria-label="Categories" className="flex flex-col divide-y divide-foreground/15 border-y border-foreground">
            {categories.map((category) => (
              <CategoryNavLink
                key={category.slug}
                slug={category.slug}
                name={category.name}
                icon={getCategoryIcon(category.slug || category.name)}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center gap-3 px-2 py-3 text-base font-semibold transition-colors hover:bg-muted"
                activeClassName="bg-foreground text-background hover:bg-foreground [&_svg]:text-background"
              />
            ))}
          </nav>
          <div className="flex flex-col">
            <Link
              href="/search"
              onClick={() => setOpen(false)}
              aria-current={pathname === "/search" ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 px-2 py-3 text-base font-medium transition-colors hover:bg-muted",
                pathname === "/search" && "bg-muted",
              )}
            >
              <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden />
              Search Products
            </Link>
            <TrackOrdersLink
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center gap-3 px-2 py-3 text-base font-medium transition-colors hover:bg-muted"
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
