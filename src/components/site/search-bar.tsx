"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app-style search bar in the header: a plain GET form to `/search`
 * (works without JavaScript), with a placeholder that cycles through real
 * product names — `Search "Toor Dal"` — so the box itself suggests what
 * the store sells. The ticker pauses as soon as the field has focus or
 * text, and stays static for `prefers-reduced-motion`.
 */
export function SearchBar({ suggestions, className }: { suggestions: string[]; className?: string }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const paused = focused || value.length > 0 || suggestions.length < 2;

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % suggestions.length), 2600);
    return () => window.clearInterval(id);
  }, [paused, suggestions.length]);

  const suggestion = suggestions[index];

  return (
    <form action="/search" role="search" className={cn("relative w-full", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.25}
      />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Search products"
        placeholder={suggestion ? "" : "Search products"}
        autoComplete="off"
        enterKeyHint="search"
        className="h-11 w-full rounded-xl border border-transparent bg-card pl-11 pr-4 text-base text-foreground shadow-[0_1px_3px_oklch(0.2_0.006_270/12%)] outline-none placeholder:text-muted-foreground focus-visible:border-foreground/20 focus-visible:ring-3 focus-visible:ring-white/40"
      />
      {suggestion && value.length === 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-11 right-4 flex items-center overflow-hidden text-base text-muted-foreground"
        >
          Search&nbsp;
          <span key={index} className="animate-ticker-in truncate font-medium text-foreground/70">
            &ldquo;{suggestion}&rdquo;
          </span>
        </span>
      )}
    </form>
  );
}
