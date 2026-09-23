"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { STOCK_STATUS_LABEL, STOCK_STATUS_TEXT_CLASS } from "@/lib/stock";
import {
  createVariantAction,
  deleteVariantAction,
  setVariantActiveAction,
  updateVariantAction,
} from "@/server/actions/admin/products";

type Variant = {
  id: string;
  size: string;
  sku: string;
  priceInPaise: number;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  isActive: boolean;
};

const INPUT_CLASS = "h-9 text-sm";

function VariantEditForm({
  variant,
  onDone,
}: {
  variant: Variant;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [size, setSize] = useState(variant.size);
  const [sku, setSku] = useState(variant.sku);
  const [price, setPrice] = useState(String(variant.priceInPaise / 100));
  const [stock, setStock] = useState(String(variant.stockQuantity));

  function handleSave() {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateVariantAction({
        id: variant.id,
        size,
        sku,
        priceInRupees: Number(price),
        stockQuantity: Number(stock),
      });
      if (result.success) {
        toast.success("Size updated.");
        onDone();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 bg-secondary/20 px-1 py-2.5">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Size</Label>
        <Input value={size} onChange={(e) => setSize(e.target.value)} className={cn(INPUT_CLASS, "w-16")} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">SKU</Label>
        <Input value={sku} onChange={(e) => setSku(e.target.value)} className={cn(INPUT_CLASS, "w-32")} />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Price (₹)</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={cn(INPUT_CLASS, "w-24")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Stock</Label>
        <Input
          type="number"
          min={0}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className={cn(INPUT_CLASS, "w-20")}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Button type="button" size="sm" className="h-9" disabled={isPending} onClick={handleSave}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-9" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function VariantRow({ variant }: { variant: Variant }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  function handleToggleActive() {
    if (isPending) return;
    startTransition(async () => {
      const result = await setVariantActiveAction({ id: variant.id, isActive: !variant.isActive });
      if (result.success) {
        toast.success(variant.isActive ? "Size deactivated." : "Size activated.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete() {
    if (isPending) return;
    const confirmed = window.confirm(`Delete size ${variant.size} (SKU ${variant.sku})? This cannot be undone.`);
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteVariantAction({ id: variant.id });
      if (result.success) {
        toast.success("Size deleted.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  if (editing) {
    return (
      <li className="border-t border-border first:border-t-0">
        <VariantEditForm variant={variant} onDone={() => setEditing(false)} />
      </li>
    );
  }

  const stockLabel = `${variant.stockQuantity} · ${STOCK_STATUS_LABEL[variant.stockStatus]}`;

  const actions = (
    <>
      <button
        type="button"
        aria-label={`Edit size ${variant.size}`}
        disabled={isPending}
        onClick={() => setEditing(true)}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        <Pencil className="size-4" aria-hidden />
      </button>
      <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" disabled={isPending} onClick={handleToggleActive}>
        {variant.isActive ? "Deactivate" : "Activate"}
      </Button>
      <button
        type="button"
        aria-label={`Delete size ${variant.size}`}
        disabled={isPending}
        onClick={handleDelete}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </>
  );

  return (
    <li className={cn("border-t border-border first:border-t-0", !variant.isActive && "opacity-50")}>
      {/* Mobile — compact stacked block. */}
      <div className="flex flex-col gap-1 px-1 py-2.5 sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Size {variant.size}</span>
          <span className={cn("text-xs font-medium", STOCK_STATUS_TEXT_CLASS[variant.stockStatus])}>
            {stockLabel}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          SKU {variant.sku} · {formatPaise(variant.priceInPaise)}
          {!variant.isActive && " · Inactive"}
        </p>
        <div className="mt-1 flex items-center gap-1">{actions}</div>
      </div>

      {/* Desktop — operational table row. */}
      <div className="hidden items-center gap-3 px-1 py-2.5 sm:flex">
        <span className="w-14 shrink-0 text-sm font-medium">{variant.size}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {variant.sku}
          {!variant.isActive && " · Inactive"}
        </span>
        <span className="w-20 shrink-0 text-right text-sm">{formatPaise(variant.priceInPaise)}</span>
        <span className={cn("w-32 shrink-0 text-right text-sm", STOCK_STATUS_TEXT_CLASS[variant.stockStatus])}>
          {stockLabel}
        </span>
        <div className="flex w-44 shrink-0 items-center justify-end gap-1">{actions}</div>
      </div>
    </li>
  );
}

function AddVariantForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [size, setSize] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const sizeId = useId();
  const skuId = useId();
  const priceId = useId();
  const stockId = useId();

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !size.trim() || !sku.trim() || !price) return;
    startTransition(async () => {
      const result = await createVariantAction({
        productId,
        size: size.trim(),
        sku: sku.trim(),
        priceInRupees: Number(price),
        stockQuantity: Number(stock) || 0,
      });
      if (result.success) {
        toast.success("Size added.");
        router.refresh();
        onDone();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={handleAdd} className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-secondary/10 p-3">
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={sizeId} className="text-xs text-muted-foreground">
            Size
          </Label>
          <Input
            id={sizeId}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="e.g. 28"
            className={cn(INPUT_CLASS, "w-20")}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={skuId} className="text-xs text-muted-foreground">
            SKU
          </Label>
          <Input id={skuId} value={sku} onChange={(e) => setSku(e.target.value)} className={cn(INPUT_CLASS, "w-32")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={priceId} className="text-xs text-muted-foreground">
            Price (₹)
          </Label>
          <Input
            id={priceId}
            type="number"
            step="0.01"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={cn(INPUT_CLASS, "w-24")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={stockId} className="text-xs text-muted-foreground">
            Opening stock
          </Label>
          <Input
            id={stockId}
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className={cn(INPUT_CLASS, "w-24")}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="h-9" disabled={isPending || !size.trim() || !sku.trim() || !price}>
          {isPending ? "Adding…" : "Add size"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-9" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ProductVariantsManager({
  productId,
  variants,
}: {
  productId: string;
  variants: Variant[];
}) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div>
      {variants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No sizes added yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <div className="hidden items-center gap-3 border-b border-border px-1 py-2 text-xs font-medium text-muted-foreground sm:flex">
            <span className="w-14 shrink-0">Size</span>
            <span className="flex-1">SKU</span>
            <span className="w-20 shrink-0 text-right">Price</span>
            <span className="w-32 shrink-0 text-right">Stock</span>
            <span className="w-44 shrink-0" />
          </div>
          <ul className="px-2">
            {variants.map((v) => (
              <VariantRow key={v.id} variant={v} />
            ))}
          </ul>
        </div>
      )}

      {showAddForm ? (
        <AddVariantForm productId={productId} onDone={() => setShowAddForm(false)} />
      ) : (
        <Button type="button" variant="outline" className="mt-3 h-9" onClick={() => setShowAddForm(true)}>
          <Plus className="size-4" aria-hidden />
          Add size
        </Button>
      )}
    </div>
  );
}
