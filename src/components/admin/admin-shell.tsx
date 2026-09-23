"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  ShoppingBag,
  Tags,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ADMIN_BRAND_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { adminLogout } from "@/server/actions/admin/auth";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/counter-sale", label: "Counter Sale", icon: ShoppingBag, exact: false },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, exact: false },
  { href: "/admin/returns", label: "Returns", icon: Undo2, exact: false },
  { href: "/admin/khatabook", label: "KhataBook", icon: Wallet, exact: false },
  { href: "/admin/products", label: "Products", icon: Package, exact: false },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes, exact: false },
  { href: "/admin/suppliers", label: "Suppliers", icon: Truck, exact: false },
  { href: "/admin/categories", label: "Categories", icon: Tags, exact: false },
  { href: "/admin/banners", label: "Banners", icon: Megaphone, exact: false },
] as const;

function isNavActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Admin sections">
      {ADMIN_NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = isNavActive(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    if (isPending) return;
    startTransition(async () => {
      await adminLogout();
      router.push("/admin/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleLogout}
      className="flex h-9 w-full items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function AdminShell({
  adminName,
  children,
}: {
  adminName: string;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    // The whole shell — not just the sidebar, not just individual
    // redesigned pages — carries `.dark` on this ONE root now. Before,
    // only `<aside>` and each page's own inner wrapper self-scoped
    // `.dark`, which left the content pane's own background (this div's
    // `bg-secondary/20`, resolved from the LIGHT theme since nothing
    // between it and `<body>` was dark) showing through as a white/cream
    // gutter around each page's dark card — exactly the "black card on a
    // white website" bug. Scoping `.dark` here instead means every
    // semantic-token class already used throughout `/admin` (`bg-card`,
    // `border-border`, `text-muted-foreground`, ...) — including on
    // pages that haven't been individually redesigned yet — resolves to
    // the dark palette automatically, with zero per-page opt-in needed.
    // `h-dvh` + `overflow-hidden` on the root (not `min-h-screen`)
    // remains the sidebar-scroll fix: a `min-h-*` container grows to fit
    // its tallest child and lets the whole shell scroll as one document;
    // pinning the root to exactly the viewport height turns `<aside>`
    // and the content pane into fixed-height flex siblings, so the
    // content pane's own `overflow-y-auto` is the one and only
    // scrolling region.
    // Phase 4 Part 7 — `print:h-auto print:overflow-visible` here (and
    // matching `print:overflow-visible` on the content pane below) is
    // the one tiny, additive print-compatibility fix this phase needs:
    // the screen-only `h-dvh`/`overflow-hidden` sidebar-scroll fix above
    // would otherwise clip a printed page (e.g. the Supplier Ledger's
    // own "Print Statement" action) to a single viewport-height of
    // content. Both classes are no-ops on screen — they only take effect
    // inside a `@media print` context — so this changes nothing about
    // any existing page's on-screen behavior.
    <div className="dark flex h-dvh flex-col overflow-hidden bg-background lg:flex-row print:h-auto print:overflow-visible">
      {/* Desktop sidebar — same `bg-background` as the content pane
          beside it (see below), deliberately identical rather than one
          shade darker: a real hairline (`border-r`) already separates
          them, and matching backgrounds exactly is the most robust way
          to guarantee zero visible seam at any zoom level or subpixel
          rounding, across every width. `print:hidden` (Phase 4 Part 7)
          keeps admin navigation out of any printed page. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border lg:flex print:hidden">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <p className="font-heading text-base font-semibold tracking-tight text-foreground">
            {ADMIN_BRAND_NAME}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{adminName}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks />
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile top bar — a plain flex sibling of the scrolling content
          pane below (not `sticky`), so it never scrolls away either. */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 lg:hidden print:hidden">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-foreground hover:bg-muted [&_svg:not([class*='size-'])]:size-5"
                aria-label="Open admin menu"
              />
            }
          >
            <Menu aria-hidden />
          </SheetTrigger>
          {/* `Sheet` portals to `document.body` — OUTSIDE this root
              div's DOM subtree — so it does NOT inherit the `.dark`
              scoped above no matter where in the tree it's declared.
              Re-applying `dark` directly here is still required, same
              as every other portaled surface in this codebase
              (mobile-nav.tsx's category drawer, the Orders filter
              sheet). */}
          <SheetContent side="left" className="dark w-[85vw] max-w-xs border-border bg-background">
            <SheetHeader>
              <SheetTitle className="text-left font-heading text-foreground">{ADMIN_BRAND_NAME}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              <p className="text-sm text-muted-foreground">{adminName}</p>
              <NavLinks onNavigate={() => setMobileNavOpen(false)} />
              <LogoutButton />
            </div>
          </SheetContent>
        </Sheet>
        <p className="font-heading text-base font-semibold text-foreground">{ADMIN_BRAND_NAME}</p>
        <span className="size-11" aria-hidden />
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-background print:overflow-visible">
        <div className="mx-auto max-w-6xl px-4 py-6 text-foreground sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">{children}</div>
      </div>
    </div>
  );
}
