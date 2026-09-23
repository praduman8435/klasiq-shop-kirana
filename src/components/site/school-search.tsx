"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, School as SchoolIcon, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { isDarkRoute } from "@/components/site/route-theme-scope";
import { cn } from "@/lib/utils";

type SchoolResult = {
  slug: string;
  name: string;
  city: string | null;
  logoUrl: string | null;
};

type MenuRect = { top: number; left: number; width: number };

export function SchoolSearch({
  size = "hero",
  placeholder = "Search your school...",
  className,
}: {
  size?: "hero" | "compact";
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      // Nothing to fetch — the change handler already cleared results.
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/schools/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { schools: SchoolResult[] };
        setResults(data.schools);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const showDropdown = isOpen && query.trim().length >= 2;

  // Positions the dropdown as a `document.body` portal, anchored to the
  // search box's live viewport coordinates — see the doc comment below
  // the JSX for why a same-tree `absolute` dropdown wasn't reliable here.
  useEffect(() => {
    if (!showDropdown) return;

    function updateRect() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuRect({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [showDropdown]);

  useEffect(() => {
    // The portaled menu lives outside `containerRef`'s DOM subtree, so a
    // click inside it must NOT count as "outside" — checked via its own
    // ref alongside the input's.
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSchool(school: SchoolResult) {
    setIsOpen(false);
    setQuery("");
    router.push(`/school/${school.slug}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && results[activeIndex]) {
        event.preventDefault();
        selectSchool(results[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "hero" ? "left-3.5 size-4.5" : "left-3 size-4",
        )}
      />
      <Input
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-label="Search for your school"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setIsOpen(true);
          if (value.trim().length < 2) {
            setResults([]);
            setIsLoading(false);
          }
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          // Rounded-xl (not a pill) so the input reads as the same
          // shape family as its own results panel — one connected
          // autocomplete surface, not two mismatched shapes stacked
          // together.
          "w-full rounded-xl border bg-card",
          size === "hero" ? "h-11 pl-10 pr-4 text-sm sm:h-12 sm:text-base" : "h-9 pl-9 pr-3 text-sm",
        )}
      />

      {/*
        Portal fix — this dropdown used to render as a same-tree
        `absolute` sibling of the input, positioned via CSS alone. On the
        homepage that reliably lost to the "Shop by category" rail below
        it for any result list tall enough to reach that far down:
        `elementFromPoint` at the exact overlap pixel resolved to the
        category rail's own `overflow-x-auto` scroll container, not this
        dropdown — Chromium promotes independently-scrolling containers
        to their own compositing layer, and layer paint order isn't
        always governed by ordinary CSS stacking rules when neither side
        has an explicit stacking context. Raising z-index alone couldn't
        fix a bug that lives one level below CSS stacking, at the
        compositing-layer boundary.
        Rendering into `document.body` via a portal sidesteps the whole
        question: the menu is no longer a descendant of anything on the
        page that could out-layer it, positioned instead from the
        search box's own live `getBoundingClientRect()` (updated on
        resize/scroll while open) via `position: fixed`.
      */}
      {showDropdown &&
        menuRect &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
            // `document.body` sits outside `RouteThemeScope`'s `.dark`
            // wrapper, so a portaled element needs the same route-aware
            // `.dark` class reapplied directly — the exact pattern
            // `MobileNav`'s own portaled `Sheet` already uses, and for
            // the same reason (otherwise this menu silently renders in
            // the light palette regardless of the page underneath it).
            className={cn(
              "fixed z-50 max-h-80 divide-y divide-border/60 overflow-y-auto overflow-x-hidden rounded-xl border border-border/70 bg-popover shadow-md",
              isDarkRoute(pathname) && "dark",
            )}
          >
            {isLoading && (
              <li className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Searching schools...
              </li>
            )}
            {!isLoading && results.length === 0 && (
              <li className="px-4 py-3.5 text-sm text-muted-foreground">
                No schools found. You can still{" "}
                <Link href="/search" className="underline underline-offset-2">
                  search our full catalog
                </Link>
                .
              </li>
            )}
            {!isLoading &&
              results.map((school, index) => (
                <li key={school.slug} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSchool(school)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors",
                      index === activeIndex ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                      <SchoolIcon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      {/* `line-clamp-2` (not `truncate`) — a school name
                          genuinely too long for one line wraps once
                          rather than being cut mid-word; still bounded
                          so one very long name can't blow out the row. */}
                      <span className="line-clamp-2 font-medium text-foreground">
                        {school.name}
                      </span>
                      {school.city && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {school.city}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
