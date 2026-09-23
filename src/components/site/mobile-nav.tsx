"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, MapPin, Menu, PackageSearch, Phone, ShoppingBag, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getCategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

export type MobileNavStore = {
  /** e.g. "Home delivery & store pickup" — derived from config server-side. */
  fulfilmentLine: string;
  /** The store's own "where do we deliver" note, from config. */
  serviceableAreaNote: string;
  phone: string;
  phoneHref: string;
  mapsUrl: string;
};

const ROW_CLASS =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring";

function RowIcon({ icon: Icon, active = false }: { icon: LucideIcon; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80",
      )}
    >
      <Icon className="size-4" strokeWidth={2} aria-hidden />
    </span>
  );
}

/**
 * The app drawer behind the header's ☰ — deliberately plain, the way a
 * production shopping app's menu is: the wordmark and a close button, one
 * compact list of aisles (the current one tinted red), then the few
 * account-free actions this store has — track an order, the bag, call,
 * directions — and the delivery note in small print. Every store fact is
 * passed in from server-side config.
 */
export function MobileNav({
  categories,
  bagCount,
  store,
  wordmark,
}: {
  categories: { slug: string; name: string }[];
  bagCount: number;
  store: MobileNavStore;
  wordmark: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-xl text-primary-foreground hover:bg-black/10 hover:text-primary-foreground md:hidden [&_svg:not([class*='size-'])]:size-6"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-6" strokeWidth={2.25} aria-hidden />
      </SheetTrigger>

      {/* `Sheet` portals to `document.body`, outside the `(site)`
          layout's `.store-theme` scope, so the panel re-applies it. */}
      <SheetContent
        side="left"
        showCloseButton={false}
        className="store-theme gap-0 data-[side=left]:w-[88vw] data-[side=left]:max-w-xs overflow-y-auto overscroll-contain border-r-0 bg-card p-0"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="min-w-0">
            <SheetTitle className="text-xl font-black leading-none tracking-[-0.01em] text-foreground">
              {wordmark}
              <span className="text-primary">.</span>
            </SheetTitle>
            <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{store.fulfilmentLine}</span>
            </p>
          </div>
          <SheetClose
            render={
              <button
                type="button"
                className="-mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              />
            }
          >
            <X className="size-5" strokeWidth={2.25} aria-hidden />
            <span className="sr-only">Close menu</span>
          </SheetClose>
        </div>

        <nav aria-labelledby="drawer-categories-heading" className="px-2 pt-3">
          <h2
            id="drawer-categories-heading"
            className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Categories
          </h2>
          <ul>
            {categories.map((category) => {
              const isCurrent = pathname === `/${category.slug}`;
              return (
                <li key={category.slug}>
                  <Link
                    href={`/${category.slug}`}
                    onClick={close}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(ROW_CLASS, isCurrent && "bg-accent text-accent-foreground hover:bg-accent")}
                  >
                    <RowIcon icon={getCategoryIcon(category.slug || category.name)} active={isCurrent} />
                    <span className="min-w-0 flex-1 truncate">{category.name}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mx-4 my-3 border-t border-border" />

        <ul className="px-2">
          <li>
            <Link href="/track" onClick={close} className={ROW_CLASS}>
              <RowIcon icon={PackageSearch} />
              <span className="flex-1">Track order</span>
            </Link>
          </li>
          <li>
            <Link href="/bag" onClick={close} className={ROW_CLASS}>
              <RowIcon icon={ShoppingBag} />
              <span className="flex-1">
                Your bag
                <span className="sr-only">
                  {bagCount > 0 ? `, ${bagCount} item${bagCount === 1 ? "" : "s"}` : ", empty"}
                </span>
              </span>
              {bagCount > 0 && (
                <span
                  aria-hidden
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground tabular-nums"
                >
                  {bagCount > 99 ? "99+" : bagCount}
                </span>
              )}
            </Link>
          </li>
          <li>
            <a href={store.phoneHref} aria-label={`Call the store, ${store.phone}`} className={ROW_CLASS}>
              <RowIcon icon={Phone} />
              <span className="flex-1">Call the store</span>
            </a>
          </li>
          <li>
            <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
              <RowIcon icon={MapPin} />
              <span className="flex-1">Get directions</span>
            </a>
          </li>
        </ul>

        <p className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 text-xs leading-relaxed text-muted-foreground">
          {store.serviceableAreaNote}
        </p>
      </SheetContent>
    </Sheet>
  );
}
