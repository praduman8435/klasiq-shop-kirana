"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput, ChoiceChips, todayInputValue } from "@/components/admin/supplier-quick-controls";
import { KHATA_PAYMENT_METHOD_LABEL, KHATA_PAYMENT_METHODS, type KhataPaymentMethod } from "@/lib/khata";
import { formatPaise } from "@/lib/money";
import { recordCollectionAction } from "@/server/actions/admin/khata-quick";

/** "Paisa mila": starts at the full amount due; cleared oldest first. */
export function KhataCollectForm({
  customerId,
  customerName,
  dueInPaise,
}: {
  customerId: string;
  customerName: string;
  dueInPaise: number;
}) {
  const router = useRouter();
  const ids = { amount: useId(), note: useId(), date: useId() };
  const [amount, setAmount] = useState(dueInPaise > 0 ? String(dueInPaise / 100) : "");
  const [method, setMethod] = useState<KhataPaymentMethod>("CASH");
  const [collectedAt, setCollectedAt] = useState(todayInputValue);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const amountInPaise = Math.round((Number(amount) || 0) * 100);
  const tooMuch = amountInPaise > dueInPaise;
  const left = dueInPaise - amountInPaise;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    if (amountInPaise <= 0) {
      setError("Enter how much they paid.");
      return;
    }
    if (tooMuch) {
      setError(`That's more than the ${formatPaise(dueInPaise)} due.`);
      return;
    }
    startTransition(async () => {
      const result = await recordCollectionAction({ customerId, amountInRupees: Number(amount), paymentMethod: method, note, collectedAt });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success(
        result.dueAfterInPaise === 0
          ? `${formatPaise(amountInPaise)} received. ${customerName}'s hisaab is barabar.`
          : `${formatPaise(amountInPaise)} received from ${customerName}.`,
      );
      router.push(`/admin/khatabook/${customerId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={ids.amount}>Amount received</Label>
          {amountInPaise !== dueInPaise && (
            <button
              type="button"
              onClick={() => setAmount(String(dueInPaise / 100))}
              className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Full {formatPaise(dueInPaise)}
            </button>
          )}
        </div>
        <AmountInput id={ids.amount} value={amount} onChange={setAmount} autoFocus invalid={tooMuch || (Boolean(error) && amountInPaise <= 0)} />
        {tooMuch && <p className="text-sm text-destructive">Only {formatPaise(dueInPaise)} is due.</p>}
      </div>

      <ChoiceChips
        label="Paid by"
        value={method}
        onChange={setMethod}
        options={KHATA_PAYMENT_METHODS.map((m) => ({ value: m, label: KHATA_PAYMENT_METHOD_LABEL[m] }))}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.date}>Date</Label>
        <Input id={ids.date} type="date" className="h-11 max-w-48" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} />
      </div>

      {showNote ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.note}>Note</Label>
          <Input id={ids.note} className="h-11" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI ref, paid by son" />
        </div>
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="-mt-2 h-9 w-fit text-sm text-muted-foreground hover:text-foreground">
          + Add a note
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {amountInPaise > 0 && !tooMuch && (
          <p className="text-sm text-muted-foreground">
            After this:{" "}
            <span className="font-medium text-foreground">
              {left === 0 ? "hisaab barabar (all paid)" : `${formatPaise(left)} still lena hai`}
            </span>
          </p>
        )}
        <Button type="submit" className="h-12 text-base" disabled={isPending || tooMuch}>
          {isPending ? "Saving…" : amountInPaise > 0 ? `Save ${formatPaise(amountInPaise)} received` : "Save payment"}
        </Button>
      </div>
    </form>
  );
}
