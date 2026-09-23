"use client";

import { useEffect, useRef, useState } from "react";
import { PromoBannerCard, type PromoBannerData } from "@/components/home/promo-banner-card";
import { cn } from "@/lib/utils";

/**
 * The homepage's swipeable banner row, showing the banners managed in
 * /admin/banners (active and in their schedule window). Native
 * scroll-snap does the swiping, so it
 * works with a thumb, a trackpad or a keyboard; the dots follow whichever
 * slide is mostly in view and jump to a slide when tapped.
 */
export function PromoCarousel({ slides }: { slides: PromoBannerData[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root: track, threshold: 0.6 },
    );
    track.querySelectorAll("[data-index]").forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [slides.length]);

  function goTo(index: number) {
    const slide = trackRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    slide?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  return (
    <section aria-label="Store highlights">
      <div
        ref={trackRef}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0"
      >
        {slides.map((slide, index) => (
          <div key={slide.id} data-index={index} className="w-[86%] shrink-0 snap-start sm:w-auto">
            <PromoBannerCard banner={slide} className="h-full" />
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5 sm:hidden">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show highlight ${index + 1} of ${slides.length}`}
              aria-current={index === active ? "true" : undefined}
              className="flex h-6 items-center px-0.5"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-300",
                  index === active ? "w-5 bg-primary" : "w-1.5 bg-foreground/20",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
