import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CouponForm } from "@/components/admin/coupon-form";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Edit offer" };

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
/** A stored India-midnight instant back to the "YYYY-MM-DD" a date input shows. */
function toDay(date: Date | null, edge: "start" | "end"): string {
  if (!date) return "";
  const t = date.getTime() + IST_OFFSET_MS - (edge === "end" ? 1 : 0);
  return new Date(t).toISOString().slice(0, 10);
}

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.coupon.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/offers" className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Offers
      </Link>
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        Edit <span className="font-mono">{c.code}</span>
      </h1>
      <div className="max-w-2xl rounded-xl border border-border bg-card p-4 sm:p-5">
        <CouponForm
          initial={{
            id: c.id,
            code: c.code,
            type: c.type,
            percent: c.type === "PERCENT" ? String(c.value) : "",
            flat: c.type === "FLAT" ? String(c.value / 100) : "",
            maxDiscount: c.maxDiscountInPaise ? String(c.maxDiscountInPaise / 100) : "",
            minOrder: c.minOrderInPaise ? String(c.minOrderInPaise / 100) : "",
            startsOn: toDay(c.startsAt, "start"),
            expiresOn: toDay(c.expiresAt, "end"),
            usageLimit: c.usageLimit ? String(c.usageLimit) : "",
            perCustomerLimit: String(c.perCustomerLimit),
            firstOrderOnly: c.firstOrderOnly,
            showOnWebsite: c.showOnWebsite,
            isActive: c.isActive,
          }}
        />
      </div>
    </div>
  );
}
