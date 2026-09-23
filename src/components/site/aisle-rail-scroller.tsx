"use client";

import { useEffect, useRef } from "react";

/**
 * The aisle rail's horizontal scroller. On arrival it scrolls the current
 * aisle's tab to the rail's centre (only the rail's own `scrollLeft` —
 * never the page), so a shopper who lands on the 6th aisle sees where they
 * are instead of the first two tabs.
 */
export function AisleRailScroller({ children }: { children: React.ReactNode }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current) return;
    const tab = current.getBoundingClientRect();
    const rail = list.getBoundingClientRect();
    list.scrollLeft += tab.left - rail.left - (rail.width - tab.width) / 2;
  }, []);

  return (
    <ul
      ref={listRef}
      className="flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </ul>
  );
}
