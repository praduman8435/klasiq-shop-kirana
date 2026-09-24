"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AmountInput,
  ChoiceChips,
  PAYMENT_METHOD_OPTIONS,
  todayInputValue,
  type QuickPaymentMethod,
} from "@/components/admin/supplier-quick-controls";
import { formatPaise } from "@/lib/money";
import { allocateOldestFirst, describeSupplierBalance } from "@/lib/supplier-balance";
import { quickRecordPaymentAction } from "@/server/actions/admin/supplier-quick";

export type OpenBill = { id: string; label: string; outstandingInPaise: number };

/**
 * "Pay · Paisa diya": how much, how (cash/UPI/…), done. The amount starts
 * at what's owed; the server splits it across unpaid bills oldest first,
 * and this form previews exactly that split before saving.
 */
export function SupplierQuickPayForm({
  supplierId,
  supplierName,
  currentBalanceInPaise,
  openBills,
}: {
  supplierId: string;
  supplierName: string;
  currentBalanceInPaise: number;
  openBills: OpenBill[];
}) {
  const router = useRouter();
  const ids = { amount: useId(), date: useId(), givenTo: useId(), reference: useId(), note: useId() };
  const [amount, setAmount] = useState(currentBalanceInPaise > 0 ? String(currentBalanceInPaise / 100) : "");
  const [method, setMethod] = useState<QuickPaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(todayInputValue);
  const [showMore, setShowMore] = useState(false);
  const [givenTo, setGivenTo] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountInPaise = Math.round((Number(amount) || 0) * 100);
  const preview = allocateOldestFirst(amountInPaise, openBills);
  const labels = new Map(openBills.map((b) => [b.id, b]));
  const after = describeSupplierBalance(currentBalanceInPaise - amountInPaise);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    if (amountInPaise <= 0) {
      setError("Enter how much you paid.");
      return;
    }
    startTransition(async () => {
      const result = await quickRecordPaymentAction({
        supplierId,
        amountInRupees: Number(amount),
        paymentDate,
        paymentMethod: method,
        givenTo,
        reference,
        note,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success(`${formatPaise(amountInPaise)} paid to ${supplierName}.`);
      router.push(`/admin/suppliers/${supplierId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={ids.amount}>Amount paid</Label>
          {currentBalanceInPaise > 0 && amountInPaise !== currentBalanceInPaise && (
            <button
              type="button"
              onClick={() => setAmount(String(currentBalanceInPaise / 100))}
              className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Pay full {formatPaise(currentBalanceInPaise)}
            </button>
          )}
        </div>
        <AmountInput id={ids.amount} value={amount} onChange={setAmount} autoFocus invalid={Boolean(error) && amountInPaise <= 0} />
      </div>

      <ChoiceChips label="Paid by" value={method} onChange={setMethod} options={PAYMENT_METHOD_OPTIONS} />

      {amountInPaise > 0 && (preview.allocations.length > 0 || preview.advanceInPaise > 0) && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">This payment will clear</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {preview.allocations.map((a) => {
              const bill = labels.get(a.purchaseId)!;
              const full = a.amountInPaise === bill.outstandingInPaise;
              return (
                <li key={a.purchaseId} className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {full && <Check className="size-3.5 shrink-0 text-emerald-400" aria-hidden />}
                    <span className="truncate">{bill.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {full ? formatPaise(a.amountInPaise) : `${formatPaise(a.amountInPaise)} of ${formatPaise(bill.outstandingInPaise)}`}
                  </span>
                </li>
              );
            })}
            {preview.advanceInPaise > 0 && (
              <li className="flex items-center justify-between gap-3 text-muted-foreground">
                <span>Extra, counted for the next bill</span>
                <span className="tabular-nums text-emerald-400">{formatPaise(preview.advanceInPaise)}</span>
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Oldest bills are paid first (purana pehle).</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.date}>Date</Label>
        <Input id={ids.date} type="date" className="h-11 max-w-48" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
      </div>

      {showMore ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.givenTo}>Given to (optional)</Label>
            <Input id={ids.givenTo} className="h-11" value={givenTo} onChange={(e) => setGivenTo(e.target.value)} placeholder={supplierName} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.reference}>UPI / cheque ref. (optional)</Label>
            <Input id={ids.reference} className="h-11" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.note}>Note (optional)</Label>
            <Input id={ids.note} className="h-11" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="-mt-2 h-9 w-fit text-sm text-muted-foreground hover:text-foreground">
          + Add who took it, UPI ref. or a note
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {amountInPaise > 0 && (
          <p className="text-sm text-muted-foreground">
            After this payment:{" "}
            <span className="font-medium text-foreground">
              {after.tone === "settled" ? "all paid (hisaab barabar)" : `${after.label} (${after.hint})`}
            </span>
          </p>
        )}
        <Button type="submit" className="h-12 text-base" disabled={isPending}>
          {isPending ? "Saving…" : amountInPaise > 0 ? `Save payment of ${formatPaise(amountInPaise)}` : "Save payment"}
        </Button>
      </div>
    </form>
  );
}
