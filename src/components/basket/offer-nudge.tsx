import { BadgePercent } from "lucide-react";
import { bestNudge, itemDiscountInPaise } from "@/lib/coupons";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getWebsiteCoupons } from "@/server/coupons/coupons";

/**
 * The bag's offer nudge: "Add ₹120 more to get ₹50 off" with a bar that
 * fills as the bag grows, or "You've unlocked…" once it qualifies. Only
 * the store's own live offers; nothing shown when there are none.
 */
export async function OfferNudge({ subtotalInPaise, className }: { subtotalInPaise: number; className?: string }) {
  const coupons = await getWebsiteCoupons();
  const nudge = bestNudge(coupons, subtotalInPaise, new Date(), (c) => c.usedCount);
  if (!nudge) return null;
  const { coupon, shortfallInPaise } = nudge;
  const reward =
    coupon.type === "FREE_DELIVERY"
      ? "free delivery"
      : `${formatPaise(itemDiscountInPaise(coupon, Math.max(subtotalInPaise, coupon.minOrderInPaise)))} off`;
  const progress = coupon.minOrderInPaise > 0 ? Math.min(100, Math.round((subtotalInPaise / coupon.minOrderInPaise) * 100)) : 100;

  return (
    <div className={cn("flex gap-3 rounded-2xl border border-primary/15 bg-brand-soft p-3.5", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
        <BadgePercent className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-brand-deep">
          {shortfallInPaise > 0 ? `Add ${formatPaise(shortfallInPaise)} more to get ${reward}` : `You've unlocked ${reward}!`}
        </p>
        <p className="mt-0.5 text-xs text-brand-deep/80">
          {shortfallInPaise > 0 ? "Then use code " : "Use code "}
          <span className="rounded border border-dashed border-primary/50 bg-card px-1.5 py-px font-mono font-bold tracking-wider text-foreground">{coupon.code}</span>{" "}
          at checkout{coupon.firstOrderOnly ? " (first online order only)" : ""}
        </p>
        {shortfallInPaise > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Towards the offer">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
