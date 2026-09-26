"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { confirmKhataPaymentAction, rejectKhataPaymentAction } from "@/server/actions/admin/khata-quick";

export type PendingClaim = {
  id: string;
  amountInPaise: number;
  upiReference: string | null;
  createdAt: Date;
  customer: { customerId: string; displayName: string | null; primaryPhone: string | null };
};

const WHEN = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Online UPI payments customers say they've made from Mera Khata. The
 * owner checks the UPI app, then confirms (recorded as a UPI collection,
 * oldest udhaar first) or marks it not received (khata unchanged).
 */
export function KhataPaymentClaims({ claims, showCustomer = true }: { claims: PendingClaim[]; showCustomer?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(claim: PendingClaim, confirm: boolean) {
    setBusy(claim.id);
    startTransition(async () => {
      const result = confirm
        ? await confirmKhataPaymentAction({ claimId: claim.id })
        : await rejectKhataPaymentAction({ claimId: claim.id });
      setBusy(null);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(confirm ? `${formatPaise(claim.amountInPaise)} added to the khata as paid` : "Marked as not received");
      router.refresh();
    });
  }

  if (claims.length === 0) return null;

  return (
    <section aria-labelledby="claims-heading" className="overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/5">
      <div className="flex items-start gap-3 border-b border-amber-500/20 px-4 py-3 sm:px-5">
        <Smartphone className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
        <div>
          <h2 id="claims-heading" className="text-sm font-semibold">
            {claims.length === 1 ? "1 online payment to check" : `${claims.length} online payments to check`}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Customers paid by UPI from Mera Khata. Find the payment in your UPI app first, then confirm it.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {claims.map((claim) => (
          <li key={claim.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="text-base font-semibold tabular-nums">
                {formatPaise(claim.amountInPaise)}
                {showCustomer && (
                  <>
                    {" "}
                    <span className="font-normal text-muted-foreground">from</span>{" "}
                    <Link href={`/admin/khatabook/${claim.customer.customerId}`} className="hover:underline">
                      {claim.customer.displayName || claim.customer.primaryPhone || claim.customer.customerId}
                    </Link>
                  </>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {WHEN.format(claim.createdAt)}
                {claim.upiReference ? ` · UPI ref ${claim.upiReference}` : " · no UPI ref given"}
                {showCustomer && claim.customer.primaryPhone ? ` · ${claim.customer.primaryPhone}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 sm:flex-none"
                disabled={isPending}
                onClick={() => decide(claim, false)}
              >
                <X className="size-4" aria-hidden />
                Not received
              </Button>
              <Button type="button" className="h-10 flex-1 sm:flex-none" disabled={isPending} onClick={() => decide(claim, true)}>
                <Check className="size-4" aria-hidden />
                {busy === claim.id ? "Saving…" : "Received, confirm"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
