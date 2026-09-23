"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiveInventoryVariantSearch } from "@/components/admin/receive-inventory-variant-search";
import type { VariantSearchResult } from "@/components/admin/counter-sale-product-search";
import { STOCK_STATUS_TEXT_CLASS } from "@/lib/stock";
import { createSupplierPurchaseReceiptAction } from "@/server/actions/admin/supplier-purchase-receipts";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type DraftItem = {
  variantId: string;
  productName: string;
  size: string;
  sku: string;
  stockQuantity: number;
  stockStatus: VariantSearchResult["stockStatus"];
  quantity: string;
  unitCost: string;
};

export function NewSupplierPurchaseReceiptForm({
  supplierId,
  purchaseId,
  supplierName,
}: {
  supplierId: string;
  purchaseId: string;
  supplierName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [receivedAt, setReceivedAt] = useState(todayIsoDate());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const notesId = useId();

  function addVariant(variant: VariantSearchResult) {
    setItems((prev) => {
      const existing = prev.find((item) => item.variantId === variant.variantId);
      if (existing) {
        // Section 7 — merge rather than reject a duplicate selection,
        // mirroring `addLineToCart`'s own identical "already in the
        // list? bump the quantity" behavior in Counter Sale
        // (src/lib/counter-sale-form.ts).
        return prev.map((item) =>
          item.variantId === variant.variantId ? { ...item, quantity: String((Number(item.quantity) || 0) + 1) } : item,
        );
      }
      return [
        ...prev,
        {
          variantId: variant.variantId,
          productName: variant.productName,
          size: variant.size,
          sku: variant.sku,
          stockQuantity: variant.stockQuantity,
          stockStatus: variant.stockStatus,
          quantity: "1",
          unitCost: "",
        },
      ];
    });
  }

  function updateItem(variantId: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.variantId === variantId ? { ...item, ...patch } : item)));
  }
  function removeItem(variantId: string) {
    setItems((prev) => prev.filter((item) => item.variantId !== variantId));
  }

  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const canSubmit = items.length > 0 && items.every((item) => Number(item.quantity) > 0);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await createSupplierPurchaseReceiptAction({
        purchaseId,
        receivedAt,
        reference: reference || undefined,
        notes: notes || undefined,
        items: items.map((item) => ({
          productVariantId: item.variantId,
          quantity: Number(item.quantity),
          unitCostInRupees: item.unitCost ? Number(item.unitCost) : undefined,
        })),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Inventory received.");
      router.push(`/admin/suppliers/${supplierId}/purchases/${purchaseId}/receive/${result.id}`);
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
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="received-date">Received date</Label>
          <Input id="received-date" type="date" className="h-9" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="receipt-reference">Reference (optional)</Label>
          <Input
            id="receipt-reference"
            className="h-9"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. delivery challan / transporter ref"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notesId}>Notes (optional)</Label>
        <Input id={notesId} className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Items</h3>
        <ReceiveInventoryVariantSearch onAdd={addVariant} />

        {items.length > 0 && (
          <div className="rounded-lg border border-border">
            <div className="hidden items-center gap-3 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="flex-1">Product</span>
              <span className="w-24 shrink-0">SKU</span>
              <span className="w-24 shrink-0 text-right">Current stock</span>
              <span className="w-24 shrink-0 text-right">Quantity</span>
              <span className="w-24 shrink-0 text-right">Unit cost (₹)</span>
              <span className="w-8 shrink-0" />
            </div>
            <ul>
              {items.map((item) => (
                <li key={item.variantId} className="border-t border-border px-3 py-2.5 first:border-t-0">
                  {/* Mobile — stacked block. */}
                  <div className="flex flex-col gap-2 sm:hidden">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.productName} &middot; Size {item.size}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">SKU {item.sku}</p>
                        <p className={cnStockClass(item.stockStatus)}>Current stock: {item.stockQuantity}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.productName} size ${item.size}`}
                        onClick={() => removeItem(item.variantId)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex flex-1 flex-col gap-1">
                        <Label htmlFor={`qty-${item.variantId}`} className="text-xs text-muted-foreground">
                          Quantity received
                        </Label>
                        <Input
                          id={`qty-${item.variantId}`}
                          type="number"
                          min={1}
                          className="h-9"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.variantId, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <Label htmlFor={`cost-${item.variantId}`} className="text-xs text-muted-foreground">
                          Unit cost (₹, optional)
                        </Label>
                        <Input
                          id={`cost-${item.variantId}`}
                          type="number"
                          step="0.01"
                          min={0}
                          className="h-9"
                          value={item.unitCost}
                          onChange={(e) => updateItem(item.variantId, { unitCost: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Desktop — table-like row. */}
                  <div className="hidden items-center gap-3 sm:flex">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.productName} &middot; Size {item.size}
                      </p>
                    </div>
                    <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{item.sku}</span>
                    <span className={`w-24 shrink-0 text-right text-xs ${STOCK_STATUS_TEXT_CLASS[item.stockStatus]}`}>{item.stockQuantity}</span>
                    <div className="w-24 shrink-0">
                      <Label htmlFor={`qty-d-${item.variantId}`} className="sr-only">
                        Quantity received for {item.productName} size {item.size}
                      </Label>
                      <Input
                        id={`qty-d-${item.variantId}`}
                        type="number"
                        min={1}
                        className="h-9 text-right"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.variantId, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <Label htmlFor={`cost-d-${item.variantId}`} className="sr-only">
                        Unit cost for {item.productName} size {item.size}
                      </Label>
                      <Input
                        id={`cost-d-${item.variantId}`}
                        type="number"
                        step="0.01"
                        min={0}
                        className="h-9 text-right"
                        value={item.unitCost}
                        onChange={(e) => updateItem(item.variantId, { unitCost: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.productName} size ${item.size}`}
                      onClick={() => removeItem(item.variantId)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Total units</span>
        <span className="text-lg font-semibold">{totalUnits}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Section 5/24 — deliberately its own color language (emerald,
            "positive stock movement"), never the same red as "Record
            Payment"/primary financial actions, so the two can never be
            confused at a glance. */}
        <Button
          type="submit"
          className="h-9 bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-600 dark:hover:bg-emerald-600/90"
          disabled={isPending || !canSubmit}
        >
          <PackagePlus className="size-4" aria-hidden />
          {isPending ? "Receiving…" : "Receive Inventory"}
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

function cnStockClass(status: VariantSearchResult["stockStatus"]) {
  return `text-xs ${STOCK_STATUS_TEXT_CLASS[status]}`;
}
