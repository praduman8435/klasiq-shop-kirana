import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Plus, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CouponActiveToggle } from "@/components/admin/coupon-active-toggle";
import { couponHeadline, couponStatus, describeCoupon, type CouponStatus } from "@/lib/coupons";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getAdminCoupons } from "@/server/coupons/coupons";

export const metadata: Metadata = { title: "Offers" };

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

const STATUS: Record<CouponStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-emerald-500/15 text-emerald-400" },
  scheduled: { label: "Starts later", className: "bg-sky-500/15 text-sky-300" },
  expired: { label: "Ended", className: "bg-secondary text-muted-foreground" },
  "used-up": { label: "All used", className: "bg-secondary text-muted-foreground" },
  off: { label: "Paused", className: "bg-secondary text-muted-foreground" },
};

/** Ready-made offers a kirana shop commonly runs — one tap fills the form. */
const STARTERS = [
  { preset: "flat50", title: "₹50 off on ₹499+", hint: "Bigger baskets" },
  { preset: "pct10", title: "10% off up to ₹100", hint: "Weekend offer" },
  { preset: "freedel", title: "Free delivery on ₹299+", hint: "Removes the delivery worry" },
  { preset: "first30", title: "₹30 off first online order", hint: "Brings counter customers online" },
];

/**
 * Offers: coupon codes for online orders. Each shows what customers get,
 * until when, and how it's doing — orders that used it, the money given
 * away, and the sales it brought in.
 */
export default async function OffersPage() {
  const coupons = await getAdminCoupons();
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Offers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Coupon codes for online orders</p>
        </div>
        <Button render={<Link href="/admin/offers/new" />} nativeButton={false} className="h-10">
          <Plus className="size-4" aria-hidden />
          New offer
        </Button>
      </div>

      {coupons.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {coupons.map((c) => {
            const status = STATUS[couponStatus(c, c.usedCount, now)];
            return (
              <li key={c.id} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
                <Link href={`/admin/offers/${c.id}`} className="group flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <span className="flex w-24 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-primary/50 bg-primary/5 px-1.5 py-2 text-center sm:w-28">
                    <span className="text-sm leading-tight font-semibold text-primary">{couponHeadline(c)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold tracking-wider">{c.code}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", status.className)}>{status.label}</span>
                      {!c.showOnWebsite && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Secret</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">{describeCoupon(c)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                      {c.usedCount} order{c.usedCount === 1 ? "" : "s"}
                      {c.usageLimit ? ` of ${c.usageLimit}` : ""}
                      {c.usedCount > 0 && ` · ${formatPaise(c.savedInPaise)} given · ${formatPaise(c.salesInPaise)} sales`}
                      {c.expiresAt && ` · till ${DAY.format(new Date(c.expiresAt.getTime() - 1))}`}
                      {c.startsAt && c.startsAt > now && ` · starts ${DAY.format(c.startsAt)}`}
                    </span>
                  </span>
                  <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground/60 group-hover:translate-x-0.5 sm:block" aria-hidden />
                </Link>
                <CouponActiveToggle id={c.id} code={c.code} isActive={c.isActive} />
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="starters-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="starters-heading" className="font-heading text-base font-semibold">
            {coupons.length ? "Start from a ready offer" : "Create your first offer"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Tap one to fill the form, then change anything you like.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STARTERS.map((s) => (
            <Link
              key={s.preset}
              href={`/admin/offers/new?preset=${s.preset}`}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:bg-secondary/40"
            >
              <TicketPercent className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
