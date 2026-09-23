"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Bike, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PromoSlide = {
  id: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
  icon: "delivery" | "pickup" | "payment" | "store";
  tone: "red" | "ink" | "soft";
};

const ICONS: Record<PromoSlide["icon"], LucideIcon> = {
  delivery: Bike,
  pickup: Store,
  payment: Banknote,
  store: Store,
};

const TONES: Record<PromoSlide["tone"], { card: string; body: string; cta: string; art: string }> = {
  red: {
    card: "bg-primary text-primary-foreground",
    body: "text-primary-foreground/85",
    cta: "bg-card text-foreground",
    art: "bg-white/12 text-white",
  },
  ink: {
    card: "bg-foreground text-background",
    body: "text-background/75",
    cta: "bg-primary text-primary-foreground",
    art: "bg-white/10 text-white",
  },
  soft: {
    card: "bg-brand-soft text-foreground",
    body: "text-foreground/70",
    cta: "bg-foreground text-background",
    art: "bg-white text-primary",
  },
};

/**
 * The homepage's swipeable banner row. Every slide is a real store fact
 * (built server-side from `FULFILLMENT_CONFIG`) — never an invented offer,
 * discount or delivery time. Native scroll-snap does the swiping, so it
 * works with a thumb, a trackpad or a keyboard; the dots follow whichever
 * slide is mostly in view and jump to a slide when tapped.
 */
export function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
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
        {slides.map((slide, index) => {
          const Icon = ICONS[slide.icon];
          const tone = TONES[slide.tone];
          return (
            <div
              key={slide.id}
              data-index={index}
              className={cn(
                "relative flex min-h-40 w-[86%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl p-5 sm:w-auto",
                tone.card,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute -right-6 -top-6 flex size-28 items-center justify-center rounded-full",
                  tone.art,
                )}
              >
                <Icon className="size-12 -translate-x-2 translate-y-2" strokeWidth={1.5} />
              </span>
              <h3 className="max-w-[78%] text-balance text-xl font-extrabold leading-tight">{slide.title}</h3>
              <p className={cn("mb-4 mt-1.5 max-w-[85%] text-sm leading-snug", tone.body)}>{slide.body}</p>
              {slide.cta && (
                <Link
                  href={slide.cta.href}
                  className={cn(
                    "mt-auto inline-flex h-9 w-fit items-center gap-1.5 rounded-lg px-3.5 text-sm font-bold transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60",
                    tone.cta,
                  )}
                >
                  {slide.cta.label}
                  <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden />
                </Link>
              )}
            </div>
          );
        })}
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
