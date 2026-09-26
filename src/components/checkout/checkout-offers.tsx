"use client";

import { useId, useState } from "react";
import { BadgePercent, Check, Loader2, X } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export type WebsiteOffer = {
  code: string;
  headline: string;
  description: string;
  minOrderInPaise: number;
};

export type AppliedOffer = {
  code: string;
  description: string;
  discountInPaise: number;
  freeDelivery: boolean;
  savingInPaise: number;
};

/**
 * Offers at checkout: type a code, or tap one of the shop's live offers.
 * Once applied it shows what it saves with a way to remove it; offers the
 * bag doesn't reach yet say how much more to add instead of an Apply.
 */
export function CheckoutOffers({
  offers,
  applied,
  subtotalInPaise,
  pending,
  error,
  onApply,
  onRemove,
}: {
  offers: WebsiteOffer[];
  applied: AppliedOffer | null;
  subtotalInPaise: number;
  pending: string | null;
  error: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  const [code, setCode] = useState("");

  return (
    <section aria-labelledby="offers-heading" className="flex flex-col gap-2.5">
      <h2 id="offers-heading" className="flex items-center gap-2 font-heading text-base font-semibold">
        <BadgePercent className="size-4 text-primary" aria-hidden />
        Offers
      </h2>

      {applied ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-600/30 bg-emerald-50 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-emerald-900">
              {applied.code} applied · you save {formatPaise(applied.savingInPaise)}
            </p>
            <p className="truncate text-xs text-emerald-800/80">{applied.description}</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${applied.code}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-emerald-900/70 hover:bg-emerald-100 hover:text-emerald-950"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <label htmlFor={inputId} className="sr-only">
            Offer code
          </label>
          <input
            id={inputId}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (code) onApply(code);
              }
            }}
            placeholder="Have a code? Enter it here"
            autoCapitalize="characters"
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3.5 font-mono text-sm tracking-wider uppercase outline-none placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring"
          />
          <button
            type="button"
            disabled={!code || pending !== null}
            onClick={() => onApply(code)}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-primary/40 px-4 text-sm font-extrabold text-primary hover:bg-accent disabled:opacity-40"
          >
            {pending === code && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Apply
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {offers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {offers
            .filter((o) => o.code !== applied?.code)
            .map((o) => {
              const shortfall = Math.max(0, o.minOrderInPaise - subtotalInPaise);
              return (
                <li key={o.code} className="flex items-stretch overflow-hidden rounded-xl border border-dashed border-primary/40 bg-card">
                  <span className="flex w-20 shrink-0 items-center justify-center border-r border-dashed border-primary/30 bg-brand-soft px-1.5 text-center text-xs leading-tight font-extrabold text-brand-deep">
                    {o.headline}
                  </span>
                  <span className="min-w-0 flex-1 px-3 py-2">
                    <span className="block font-mono text-sm font-bold tracking-wider">{o.code}</span>
                    <span className="block text-xs text-muted-foreground">{o.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center pr-2">
                    {shortfall > 0 ? (
                      <span className="px-2 text-right text-xs font-semibold text-muted-foreground">Add {formatPaise(shortfall)} more</span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending !== null}
                        onClick={() => onApply(o.code)}
                        className={cn(
                          "inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-extrabold text-primary hover:bg-accent disabled:opacity-40",
                        )}
                      >
                        {pending === o.code && <Loader2 className="size-4 animate-spin" aria-hidden />}
                        Apply
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
