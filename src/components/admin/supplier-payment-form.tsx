"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { createSupplierPaymentAction } from "@/server/actions/admin/supplier-payments";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
] as const;

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type DraftAttachment = { key: number; url: string; originalFilename: string };
type Purchase = { id: string; purchaseDate: Date; reference: string | null; totalInPaise: number; paidInPaise: number; outstandingInPaise: number };

/**
 * Section 4/6 — same "paste a link to an already-hosted image" pattern
 * as supplier-purchase-form.tsx's own AttachmentEditor (Phase 4 Part 2)
 * — duplicated locally rather than extracted into a shared component,
 * since touching that already-shipped, verified form is out of scope
 * for this phase unless absolutely necessary (it isn't).
 */
function AttachmentEditor({
  attachments,
  onAdd,
  onRemove,
}: {
  attachments: DraftAttachment[];
  onAdd: (url: string, filename: string) => void;
  onRemove: (key: number) => void;
}) {
  const [url, setUrl] = useState("");
  const urlId = useId();

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    let filename = "";
    try {
      filename = decodeURIComponent(new URL(trimmed).pathname.split("/").pop() ?? "");
    } catch {
      // Not a parseable URL yet — validation on submit will catch it.
    }
    onAdd(trimmed, filename);
    setUrl("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={urlId} className="text-xs text-muted-foreground">
        Payment proof
      </Label>
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.key} className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary/20">
              {/* eslint-disable-next-line @next/next/no-img-element -- pasted external URL, not an optimizable local/known-domain asset */}
              <img
                src={attachment.url}
                alt={attachment.originalFilename || "Payment proof"}
                className="size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <button
                type="button"
                aria-label={`Remove attachment ${attachment.originalFilename || attachment.url}`}
                onClick={() => onRemove(attachment.key)}
                className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          id={urlId}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link to an already-hosted receipt image"
          className="h-8 flex-1 text-sm"
        />
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAdd} disabled={!url.trim()}>
          <Plus className="size-3.5" aria-hidden />
          Add image
        </Button>
      </div>
    </div>
  );
}

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
          Total {formatPaise(purchase.totalInPaise)} · Paid {formatPaise(purchase.paidInPaise)} · Remaining{" "}
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
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Paid</span>
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

export function NewSupplierPaymentForm({
  supplierId,
  supplierName,
  outstandingInPaise,
  purchases,
}: {
  supplierId: string;
  supplierName: string;
  outstandingInPaise: number;
  purchases: Purchase[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHOD_OPTIONS)[number]["value"]>("CASH");
  const [collectedByName, setCollectedByName] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addAttachment(url: string, filename: string) {
    setAttachments((prev) => [...prev, { key: Date.now() + Math.random(), url, originalFilename: filename }]);
  }
  function removeAttachment(key: number) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  const amountInPaise = Math.round((Number(amount) || 0) * 100);
  const allocatedInPaise = Object.values(allocations).reduce((sum, v) => sum + Math.round((Number(v) || 0) * 100), 0);
  const unallocatedInPaise = amountInPaise - allocatedInPaise;
  const outstandingPurchases = purchases.filter((p) => p.outstandingInPaise > 0);
  const paidOffPurchases = purchases.filter((p) => p.outstandingInPaise <= 0);

  const canSubmit =
    amountInPaise > 0 &&
    collectedByName.trim().length > 0 &&
    unallocatedInPaise >= 0 &&
    outstandingPurchases.every((p) => {
      const raw = allocations[p.id];
      const value = Math.round((Number(raw) || 0) * 100);
      return value <= p.outstandingInPaise;
    });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await createSupplierPaymentAction({
        supplierId,
        paymentDate,
        amountInRupees: Number(amount),
        paymentMethod,
        collectedByName,
        reference: reference || undefined,
        notes: notes || undefined,
        allocations: Object.entries(allocations)
          .filter(([, value]) => Number(value) > 0)
          .map(([purchaseId, value]) => ({ purchaseId, amountInRupees: Number(value) })),
        attachments: attachments.map((a) => ({ url: a.url, originalFilename: a.originalFilename || undefined })),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Payment recorded.");
      router.push(`/admin/suppliers/${supplierId}/payments/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Supplier</p>
          <p className="text-sm font-medium">{supplierName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formatPaise(outstandingInPaise)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="payment-date">Payment date</Label>
          <Input id="payment-date" type="date" className="h-9" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="payment-amount">Amount (₹)</Label>
          <Input id="payment-amount" type="number" step="0.01" min={0} className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="payment-method">Payment method</Label>
          <select
            id="payment-method"
            className={SELECT_CLASS}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          >
            {PAYMENT_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="collected-by">Collected by</Label>
          <Input
            id="collected-by"
            className="h-9"
            value={collectedByName}
            onChange={(e) => setCollectedByName(e.target.value)}
            placeholder="Who from the supplier's side received this?"
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="payment-reference">Reference (optional)</Label>
          <Input
            id="payment-reference"
            className="h-9"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={paymentMethod === "CASH" ? "Not usually needed for cash" : "Transaction / cheque number"}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-notes">Notes (optional)</Label>
        <Input id="payment-notes" className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <AttachmentEditor attachments={attachments} onAdd={addAttachment} onRemove={removeAttachment} />

      <div className="border-t border-border" />

      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Allocate payment</h3>
        <p className="text-xs text-muted-foreground">Choose which purchases this payment settles. Any leftover amount stays as supplier credit.</p>
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
          {paidOffPurchases.map((purchase) => (
            <AllocationRow key={purchase.id} purchase={purchase} value="" onChange={() => {}} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Payment</span>
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
        <Button type="submit" className="h-9" disabled={isPending || !canSubmit}>
          {isPending ? "Saving…" : "Record Payment"}
        </Button>
        <Button type="button" variant="ghost" className="h-9" disabled={isPending} onClick={() => router.push(`/admin/suppliers/${supplierId}`)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
