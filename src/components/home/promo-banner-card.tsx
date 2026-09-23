import Link from "next/link";
import { ArrowRight, Banknote, Bike, PartyPopper, Sprout, Store, Tag, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PromoBannerTone = "RED" | "INK" | "SOFT";
export type PromoBannerIcon = "DELIVERY" | "PICKUP" | "PAYMENT" | "OFFER" | "FESTIVAL" | "FRESH";

export type PromoBannerData = {
  id: string;
  title: string;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  tone: PromoBannerTone;
  icon: PromoBannerIcon;
};

export const BANNER_ICON_COMPONENTS: Record<PromoBannerIcon, LucideIcon> = {
  DELIVERY: Bike,
  PICKUP: Store,
  PAYMENT: Banknote,
  OFFER: Tag,
  FESTIVAL: PartyPopper,
  FRESH: Sprout,
};

const TONES: Record<PromoBannerTone, { card: string; body: string; cta: string; art: string }> = {
  RED: {
    card: "bg-primary text-primary-foreground",
    body: "text-primary-foreground/85",
    cta: "bg-card text-foreground",
    art: "bg-white/12 text-white",
  },
  INK: {
    card: "bg-foreground text-background",
    body: "text-background/75",
    cta: "bg-primary text-primary-foreground",
    art: "bg-white/10 text-white",
  },
  SOFT: {
    card: "bg-brand-soft text-foreground",
    body: "text-foreground/70",
    cta: "bg-foreground text-background",
    art: "bg-white text-primary",
  },
};

/**
 * One homepage banner. Shared by the storefront carousel and the admin
 * banner editor's live preview, so what the owner previews is exactly
 * what customers see. `preview` renders the CTA as a plain span, so a
 * preview never navigates away from the editor.
 */
export function PromoBannerCard({
  banner,
  preview = false,
  className,
}: {
  banner: PromoBannerData;
  preview?: boolean;
  className?: string;
}) {
  const Icon = BANNER_ICON_COMPONENTS[banner.icon];
  const tone = TONES[banner.tone];
  const ctaClass = cn(
    "mt-auto inline-flex h-9 w-fit items-center gap-1.5 rounded-lg px-3.5 text-sm font-bold transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60",
    tone.cta,
  );
  const cta = banner.ctaLabel && banner.ctaHref && (
    <>
      {banner.ctaLabel}
      <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden />
    </>
  );

  return (
    <div className={cn("relative flex min-h-40 flex-col overflow-hidden rounded-2xl p-5", tone.card, className)}>
      <span
        aria-hidden
        className={cn("absolute -right-6 -top-6 flex size-28 items-center justify-center rounded-full", tone.art)}
      >
        <Icon className="size-12 -translate-x-2 translate-y-2" strokeWidth={1.5} />
      </span>
      <h3 className="text-balance pr-20 text-xl font-extrabold leading-tight">{banner.title}</h3>
      {banner.body && <p className={cn("mt-1.5 pr-12 text-sm leading-snug", tone.body)}>{banner.body}</p>}
      <div className="h-4 shrink-0" aria-hidden />
      {cta &&
        (preview ? (
          <span className={ctaClass}>{cta}</span>
        ) : (
          <Link href={banner.ctaHref!} className={ctaClass}>
            {cta}
          </Link>
        ))}
    </div>
  );
}
