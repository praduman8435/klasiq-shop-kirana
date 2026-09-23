"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import { createSupplierPurchaseReturnAction } from "@/server/actions/admin/supplier-purchase-returns";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const RETURN_REASON_OPTIONS = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "WRONG_SIZE", label: "Wrong size" },
  { value: "DEFECTIVE", label: "Defective" },
  { value: "EXCESS_QUANTITY", label: "Excess quantity" },
  { value: "QUALITY_ISSUE", label: "Quality issue" },
  { value: "SUPPLIER_REQUEST", label: "Supplier request" },
  { value: "OTHER", label: "Other" },
] as const;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function generateIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type ReturnableVariant = {
  productVariantId: string;
  productName: string;
  size: string;
  sku: string;
  receivedQuantity: number;
  alreadyReturnedQuantity: number;
  returnableQuantity: number;
  currentStock: number;
};

function ReturnItemRow({
  variant,
  value,
  onChange,
}: {
  variant: ReturnableVariant;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const maxAllowed = Math.min(variant.returnableQuantity, variant.currentStock);
  const isFullyReturned = variant.returnableQuantity <= 0;
  const noStockAvailable = !isFullyReturned && variant.currentStock <= 0;

  return (
    <div className="border-t border-border py-3 first:border-t-0">
      {/* Mobile — stacked block. */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div>
          <p className="text-sm font-medium">
            {variant.productName} &middot; {variant.size}
          </p>
          <p className="text-xs text-muted-foreground">SKU {variant.sku}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Received: <span className="font-medium text-foreground">{variant.receivedQuantity}</span></span>
          <span>Already returned: <span className="font-medium text-foreground">{variant.alreadyReturnedQuantity}</span></span>
          <span>Returnable: <span className="font-medium text-foreground">{variant.returnableQuantity}</span></span>
          <span>Current stock: <span className="font-medium text-foreground">{variant.currentStock}</span></span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={inputId} className="text-xs text-muted-foreground">
            Return quantity
          </Label>
          {isFullyReturned ? (
            <span className="text-sm font-medium text-muted-foreground">Fully returned</span>
          ) : noStockAvailable ? (
            <span className="text-sm font-medium text-muted-foreground">None in stock</span>
          ) : (
            <Input id={inputId} type="number" min={0} max={maxAllowed} className="h-9" value={value} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
      </div>

      {/* Desktop — table-like row. */}
      <div className="hidden items-center gap-3 sm:flex">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {variant.productName} &middot; {variant.size}
          </p>
          <p className="truncate text-xs text-muted-foreground">SKU {variant.sku}</p>
        </div>
        <span className="w-20 shrink-0 text-right text-sm">{variant.receivedQuantity}</span>
        <span className="w-24 shrink-0 text-right text-sm text-muted-foreground">{variant.alreadyReturnedQuantity}</span>
        <span className="w-24 shrink-0 text-right text-sm font-medium">{variant.returnableQuantity}</span>
        <span className="w-24 shrink-0 text-right text-sm text-muted-foreground">{variant.currentStock}</span>
        <div className="w-24 shrink-0">
          <Label htmlFor={`${inputId}-d`} className="sr-only">
            Return quantity for {variant.productName} size {variant.size}
          </Label>
          {isFullyReturned ? (
            <span className="block text-right text-xs text-muted-foreground">Fully returned</span>
          ) : noStockAvailable ? (
            <span className="block text-right text-xs text-muted-foreground">None in stock</span>
          ) : (
            <Input id={`${inputId}-d`} type="number" min={0} max={maxAllowed} className="h-9 text-right" value={value} onChange={(e) => onChange(e.target.value)} />
          )}
        </div>
      </div>
    </div>
  );
}

export function NewSupplierPurchaseReturnForm({
  supplierId,
  purchaseId,
  supplierName,
  purchaseTotalInPaise,
  returnableVariants,
}: {
  supplierId: string;
  purchaseId: string;
  supplierName: string;
  purchaseTotalInPaise: number;
  returnableVariants: ReturnableVariant[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [returnDate, setReturnDate] = useState(todayIsoDate());
  const [reason, setReason] = useState<(typeof RETURN_REASON_OPTIONS)[number]["value"]>("DAMAGED");
  const [reasonNote, setReasonNote] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(generateIdempotencyKey);
  const notesId = useId();
  const reasonNoteId = useId();

  const totalUnits = Object.values(quantities).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const canSubmit =
    totalUnits > 0 &&
    returnableVariants.every((variant) => {
      const raw = Number(quantities[variant.productVariantId]) || 0;
      return raw <= Math.min(variant.returnableQuantity, variant.currentStock);
    });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await createSupplierPurchaseReturnAction({
        purchaseId,
        returnDate,
        reason,
        reasonNote: reasonNote || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        idempotencyKey,
        items: Object.entries(quantities)
          .filter(([, value]) => Number(value) > 0)
          .map(([productVariantId, value]) => ({ productVariantId, quantity: Number(value) })),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Supplier return recorded.");
      router.push(`/admin/suppliers/${supplierId}/purchases/${purchaseId}/returns/${result.id}`);
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
          <p className="text-xs text-muted-foreground">Purchase total</p>
          <p className="text-sm font-semibold">{formatPaise(purchaseTotalInPaise)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="return-date">Return date</Label>
          <Input id="return-date" type="date" className="h-9" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="return-reason">Reason</Label>
          <select id="return-reason" className={SELECT_CLASS} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {RETURN_REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="return-reference">Reference (optional)</Label>
          <Input id="return-reference" className="h-9" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      {reason === "OTHER" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={reasonNoteId}>Explain (optional)</Label>
          <Input id={reasonNoteId} className="h-9" value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notesId}>Notes (optional)</Label>
        <Input id={notesId} className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Items to return</h3>

        {returnableVariants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inventory has been received against this purchase yet — nothing is available to return.</p>
        ) : (
          <div className="rounded-lg border border-border px-3">
            <div className="hidden items-center gap-3 border-b border-border py-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="flex-1">Product</span>
              <span className="w-20 shrink-0 text-right">Received</span>
              <span className="w-24 shrink-0 text-right">Already returned</span>
              <span className="w-24 shrink-0 text-right">Returnable</span>
              <span className="w-24 shrink-0 text-right">Current stock</span>
              <span className="w-24 shrink-0 text-right">Return qty</span>
            </div>
            {returnableVariants.map((variant) => (
              <ReturnItemRow
                key={variant.productVariantId}
                variant={variant}
                value={quantities[variant.productVariantId] ?? ""}
                onChange={(value) => setQuantities((prev) => ({ ...prev, [variant.productVariantId]: value }))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Total units</span>
        <span className="text-lg font-semibold">{totalUnits}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Section 7/24 — its own visual treatment: amber "warning/
            reversal" tone, distinct from Receive Inventory's emerald
            "positive movement" and Record Payment's primary red — this
            action reduces stock, which deserves a caution-adjacent
            color, never the same look as either of those. */}
        <Button
          type="submit"
          className="h-9 bg-amber-600 text-white hover:bg-amber-600/90 dark:bg-amber-600 dark:hover:bg-amber-600/90"
          disabled={isPending || !canSubmit}
        >
          <Undo2 className="size-4" aria-hidden />
          {isPending ? "Recording…" : "Confirm Supplier Return"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={isPending}
          onClick={() => router.push(`/admin/suppliers/${supplierId}/purchases/${purchaseId}`)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
