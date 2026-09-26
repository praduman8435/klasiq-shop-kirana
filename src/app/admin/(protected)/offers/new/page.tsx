import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CouponForm } from "@/components/admin/coupon-form";
import { EMPTY_COUPON, type CouponFormValues } from "@/lib/coupon-form-values";

export const metadata: Metadata = { title: "New offer" };

const PRESETS: Record<string, Partial<CouponFormValues>> = {
  flat50: { code: "SAVE50", type: "FLAT", flat: "50", minOrder: "499" },
  pct10: { code: "WEEKEND10", type: "PERCENT", percent: "10", maxDiscount: "100", minOrder: "299" },
  freedel: { code: "FREEDEL", type: "FREE_DELIVERY", minOrder: "299" },
  first30: { code: "FIRST30", type: "FLAT", flat: "30", minOrder: "199", firstOrderOnly: true },
};

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const { preset } = await searchParams;
  const initial = { ...EMPTY_COUPON, ...(preset ? PRESETS[preset] : {}) };
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/offers" className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Offers
      </Link>
      <h1 className="font-heading text-xl font-semibold tracking-tight">New offer</h1>
      <div className="max-w-2xl rounded-xl border border-border bg-card p-4 sm:p-5">
        <CouponForm initial={initial} />
      </div>
    </div>
  );
}
