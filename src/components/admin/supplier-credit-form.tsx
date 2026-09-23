"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { createSupplierCreditAction } from "@/server/actions/admin/supplier-credits";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const CREDIT_REASON_OPTIONS = [
  { value: "SUPPLIER_RETURN", label: "Supplier return" },
  { value: "OVERPAYMENT", label: "Overpayment" },
  { value: "PRICE_ADJUSTMENT", label: "Price adjustment" },
  { value: "QUALITY_ADJUSTMENT", label: "Quality adjustment" },
  { value: "COMMERCIAL_ADJUSTMENT", label: "Commercial adjustment" },
  { value: "OTHER", label: "Other" },
] as const;

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type Purchase = {
  id: string;
  purchaseDate: Date;
  reference: string | null;
  totalInPaise: number;
  paidInPaise: number;
  creditsAppliedInPaise: number;
  outstandingInPaise: number;
};
type ReturnOption = { id: string; returnNumber: string; returnDate: Date };

function AllocationRow({
  purchase,
  value,
  onChange,
}: {
  purchase: Purchase;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const isPaidOff = purchase.outstandingInPaise <= 0;

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{DATE_FORMATTER.format(purchase.purchaseDate)}{purchase.reference ? ` · ${purchase.reference}` : ""}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Total {formatPaise(purchase.totalInPaise)} · Paid {formatPaise(purchase.paidInPaise)} · Credited {formatPaise(purchase.creditsAppliedInPaise)} · Outstanding{" "}
          <span className={cn("font-medium", isPaidOff ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
            {formatPaise(purchase.outstandingInPaise)}
          </span>
        </p>
      </div>
      <div className="w-full sm:w-36">
        <Label htmlFor={inputId} className="sr-only">
          Allocate to {DATE_FORMATTER.format(purchase.purchaseDate)}
        </Label>
        {isPaidOff ? (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Settled</span>
        ) : (
          <Input
            id={inputId}
            type="number"
            step="0.01"
            min={0}
            max={purchase.outstandingInPaise / 100}
            className="h-9 text-right"
            placeholder="₹0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

export function NewSupplierCreditForm({
  supplierId,
  supplierName,
  purchases,
  returnOptions,
}: {
  supplierId: string;
  supplierName: string;
  purchases: Purchase[];
  returnOptions: ReturnOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creditDate, setCreditDate] = useState(todayIsoDate());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<(typeof CREDIT_REASON_OPTIONS)[number]["value"]>("SUPPLIER_RETURN");
  const [sourceReturnId, setSourceReturnId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const amountInPaise = Math.round((Number(amount) || 0) * 100);
  const allocatedInPaise = Object.values(allocations).reduce((sum, v) => sum + Math.round((Number(v) || 0) * 100), 0);
  const unallocatedInPaise = amountInPaise - allocatedInPaise;
  const outstandingPurchases = purchases.filter((p) => p.outstandingInPaise > 0);
  const settledPurchases = purchases.filter((p) => p.outstandingInPaise <= 0);

  const canSubmit =
    amountInPaise > 0 &&
    unallocatedInPaise >= 0 &&
    outstandingPurchases.every((p) => {
      const raw = Number(allocations[p.id]) || 0;
      return Math.round(raw * 100) <= p.outstandingInPaise;
    });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await createSupplierCreditAction({
        supplierId,
        creditDate,
        amountInRupees: Number(amount),
        reason,
        sourceReturnId: sourceReturnId || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: Object.entries(allocations)
          .filter(([, value]) => Number(value) > 0)
          .map(([purchaseId, value]) => ({ purchaseId, amountInRupees: Number(value) })),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Supplier credit recorded.");
      router.push(`/admin/suppliers/${supplierId}/credits/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <p className="text-xs text-muted-foreground">Supplier</p>
        <p className="text-sm font-medium">{supplierName}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="credit-date">Credit date</Label>
          <Input id="credit-date" type="date" className="h-9" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="credit-amount">Amount (₹)</Label>
          <Input id="credit-amount" type="number" step="0.01" min={0} className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="credit-reason">Reason</Label>
          <select id="credit-reason" className={SELECT_CLASS} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {CREDIT_REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {returnOptions.length > 0 && (
        <div className="flex min-w-32 flex-col gap-1.5">
          <Label htmlFor="credit-source-return">Linked supplier return (optional)</Label>
          <select id="credit-source-return" className={SELECT_CLASS} value={sourceReturnId} onChange={(e) => setSourceReturnId(e.target.value)}>
            <option value="">None</option>
            {returnOptions.map((option) => (
              <option key={option.id} value={option.id}>
                #{option.returnNumber} · {DATE_FORMATTER.format(option.returnDate)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Context only — linking a return does not automatically calculate or apply this credit.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="credit-reference">Reference (optional)</Label>
          <Input id="credit-reference" className="h-9" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="credit-notes">Notes (optional)</Label>
        <Input id="credit-notes" className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Allocate credit</h3>
        <p className="text-xs text-muted-foreground">Choose which purchases this credit settles. Any leftover amount stays unallocated.</p>
      </div>

      {purchases.length === 0 ? (
        <p className="text-sm text-muted-foreground">This supplier has no purchases recorded yet.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card px-4">
          {outstandingPurchases.map((purchase) => (
            <AllocationRow
              key={purchase.id}
              purchase={purchase}
              value={allocations[purchase.id] ?? ""}
              onChange={(value) => setAllocations((prev) => ({ ...prev, [purchase.id]: value }))}
            />
          ))}
          {settledPurchases.map((purchase) => (
            <AllocationRow key={purchase.id} purchase={purchase} value="" onChange={() => {}} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Credit Amount</span>
          <span className="font-semibold">{formatPaise(amountInPaise)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Allocated</span>
          <span className="font-medium">{formatPaise(allocatedInPaise)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{unallocatedInPaise < 0 ? "Over-allocated" : "Unallocated"}</span>
          <span className={cn("font-medium", unallocatedInPaise < 0 && "text-destructive")}>{formatPaise(Math.abs(unallocatedInPaise))}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Neutral/primary treatment — deliberately not red (Record
            Payment), emerald (Receive Inventory), or amber (Return to
            Supplier): a credit is a bookkeeping entry, not a stock or
            cash movement in itself. */}
        <Button type="submit" className="h-9" variant="secondary" disabled={isPending || !canSubmit}>
          <PlusCircle className="size-4" aria-hidden />
          {isPending ? "Saving…" : "Record Credit"}
        </Button>
        <Button type="button" variant="ghost" className="h-9" disabled={isPending} onClick={() => router.push(`/admin/suppliers/${supplierId}`)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
