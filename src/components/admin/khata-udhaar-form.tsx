"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput, todayInputValue } from "@/components/admin/supplier-quick-controls";
import { formatPaise } from "@/lib/money";
import { recordUdhaarAction } from "@/server/actions/admin/khata-quick";

/** What regulars most often take on udhaar — one tap adds it to the note. */
const QUICK_ITEMS = ["Doodh", "Bread", "Atta", "Chawal", "Dal", "Tel", "Sabun", "Ande"];

/** "Udhaar diya": the amount, what was taken (optional), done. */
export function KhataUdhaarForm({
  customerId,
  customerName,
  currentDueInPaise,
}: {
  customerId: string;
  customerName: string;
  currentDueInPaise: number;
}) {
  const router = useRouter();
  const ids = { amount: useId(), note: useId(), date: useId() };
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [entryDate, setEntryDate] = useState(todayInputValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const amountInPaise = Math.round((Number(amount) || 0) * 100);

  function addItem(item: string) {
    setNote((current) => {
      const parts = current.split(",").map((p) => p.trim()).filter(Boolean);
      return parts.includes(item) ? current : [...parts, item].join(", ");
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    if (amountInPaise <= 0) {
      setError("Enter the udhaar amount.");
      return;
    }
    startTransition(async () => {
      const result = await recordUdhaarAction({ customerId, amountInRupees: Number(amount), note, entryDate });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success(`${formatPaise(amountInPaise)} udhaar written for ${customerName}.`);
      router.push(`/admin/khatabook/${customerId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.amount}>Udhaar amount</Label>
        <AmountInput id={ids.amount} value={amount} onChange={setAmount} autoFocus invalid={Boolean(error) && amountInPaise <= 0} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.note}>What did they take? (optional)</Label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => addItem(item)}
              className="h-9 rounded-full border border-border px-3 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              + {item}
            </button>
          ))}
        </div>
        <Input id={ids.note} className="h-11" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. doodh, bread" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.date}>Date</Label>
        <Input id={ids.date} type="date" className="h-11 max-w-48" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {amountInPaise > 0 && (
          <p className="text-sm text-muted-foreground">
            Total after this: <span className="font-medium text-foreground">{formatPaise(currentDueInPaise + amountInPaise)} lena hai</span>
          </p>
        )}
        <Button type="submit" className="h-12 text-base" disabled={isPending}>
          {isPending ? "Saving…" : amountInPaise > 0 ? `Save ${formatPaise(amountInPaise)} udhaar` : "Save udhaar"}
        </Button>
      </div>
    </form>
  );
}
