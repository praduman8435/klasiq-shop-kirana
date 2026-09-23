"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Info, MapPin, Menu, PackageSearch, Phone, ShoppingBag, X } from "lucide-react";
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
  "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left text-base font-semibold transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring";
const ROW_ICON_CLASS = "flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-deep";
const QUICK_TILE_CLASS =
  "flex flex-col gap-2 rounded-2xl bg-card p-3 text-foreground shadow-[0_2px_8px_-2px_oklch(0.2_0.006_270/25%)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60";

/**
 * The app drawer behind the header's ☰: a red top panel that continues the
 * header (wordmark, fulfilment line), two quick-action tiles (Track order,
 * Your bag with its live count), every aisle as the same soft-red tiles the
 * homepage uses (current aisle ringed), and the store's help rows — call,
 * directions, where we deliver. Every store fact is passed in from
 * server-side config; nothing here is invented copy.
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
        className="store-theme w-[88vw] max-w-sm gap-0 overflow-y-auto overscroll-contain border-r-0 bg-background p-0"
      >
        <div className="relative bg-primary px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top))] text-primary-foreground">
          <SheetTitle className="text-2xl font-black leading-none tracking-[-0.01em] text-primary-foreground">
            {wordmark}
            <span className="text-foreground">.</span>
          </SheetTitle>
          <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary-foreground/85">
            <MapPin className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
            {store.fulfilmentLine}
          </p>
          <SheetClose
            render={
              <button
                type="button"
                className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] flex size-10 items-center justify-center rounded-xl text-primary-foreground transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60"
              />
            }
          >
            <X className="size-5" strokeWidth={2.5} aria-hidden />
            <span className="sr-only">Close menu</span>
          </SheetClose>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Link
              href="/track"
              onClick={close}
              aria-current={pathname.startsWith("/track") ? "page" : undefined}
              className={QUICK_TILE_CLASS}
            >
              <PackageSearch className="size-5 text-primary" strokeWidth={2.25} aria-hidden />
              <span className="text-sm font-extrabold leading-tight">Track order</span>
            </Link>
            <Link
              href="/bag"
              onClick={close}
              aria-current={pathname === "/bag" ? "page" : undefined}
              className={QUICK_TILE_CLASS}
            >
              <span className="flex items-center justify-between">
                <ShoppingBag className="size-5 text-primary" strokeWidth={2.25} aria-hidden />
                {bagCount > 0 && (
                  <span
                    aria-hidden
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-extrabold text-background tabular-nums"
                  >
                    {bagCount > 99 ? "99+" : bagCount}
                  </span>
                )}
              </span>
              <span className="text-sm font-extrabold leading-tight">
                Your bag
                <span className="sr-only">
                  {bagCount > 0 ? `, ${bagCount} item${bagCount === 1 ? "" : "s"}` : ", empty"}
                </span>
              </span>
            </Link>
          </div>
        </div>

        <nav aria-labelledby="drawer-categories-heading" className="px-4 pb-2 pt-5">
          <h2 id="drawer-categories-heading" className="text-base font-extrabold">
            Shop by category
          </h2>
          <ul className="mt-3 grid grid-cols-3 gap-x-2.5 gap-y-3.5">
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.slug || category.name);
              const isCurrent = pathname === `/${category.slug}`;
              return (
                <li key={category.slug}>
                  <Link
                    href={`/${category.slug}`}
                    onClick={close}
                    aria-current={isCurrent ? "page" : undefined}
                    className="group flex flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "flex aspect-square w-full items-center justify-center rounded-2xl bg-brand-soft transition-transform group-active:scale-95",
                        isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      )}
                    >
                      <Icon className="size-8 text-brand-deep" strokeWidth={1.5} aria-hidden />
                    </span>
                    <span
                      className={cn(
                        "line-clamp-2 text-center text-xs font-semibold leading-tight",
                        isCurrent ? "text-primary" : "text-foreground",
                      )}
                    >
                      {category.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section
          aria-labelledby="drawer-help-heading"
          className="mt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <h2 id="drawer-help-heading" className="px-4 text-base font-extrabold">
            Help &amp; store
          </h2>
          <ul className="mt-2 divide-y divide-border border-y border-border bg-card">
            <li>
              <a href={store.phoneHref} className={ROW_CLASS}>
                <span className={ROW_ICON_CLASS}>
                  <Phone className="size-4" strokeWidth={2.25} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  Call the store
                  <span className="block text-xs font-medium text-muted-foreground tabular-nums">{store.phone}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </a>
            </li>
            <li>
              <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
                <span className={ROW_ICON_CLASS}>
                  <MapPin className="size-4" strokeWidth={2.25} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  Get directions
                  <span className="block text-xs font-medium text-muted-foreground">Opens Google Maps</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </a>
            </li>
            <li className="flex gap-3 px-4 py-3.5">
              <span className={ROW_ICON_CLASS}>
                <Info className="size-4" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">Where we deliver</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {store.serviceableAreaNote}
                </span>
              </span>
            </li>
          </ul>
        </section>
      </SheetContent>
    </Sheet>
  );
}
