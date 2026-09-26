"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Eye, EyeOff, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMMON_PACK_SIZES } from "@/components/admin/product-form";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
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
  mrpInPaise: number | null;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  isActive: boolean;
};

const money = (v: string) => v.replace(/[^\d.]/g, "");
const whole = (v: string) => v.replace(/\D/g, "");

function stockText(v: Variant) {
  if (v.stockStatus === "OUT_OF_STOCK") return { text: "Out of stock", className: "text-destructive" };
  if (v.stockStatus === "LOW_STOCK") return { text: `${v.stockQuantity} left · running low`, className: "text-amber-400" };
  return { text: `${v.stockQuantity} in stock`, className: "text-muted-foreground" };
}

/** Size, price, MRP and stock — the same fields for adding and editing a pack. */
function PackFields({
  values,
  onChange,
  showPresets,
  extra,
}: {
  values: { size: string; price: string; mrp: string; stock: string };
  onChange: (next: { size: string; price: string; mrp: string; stock: string }) => void;
  showPresets?: boolean;
  extra?: React.ReactNode;
}) {
  const ids = { size: useId(), price: useId(), mrp: useId(), stock: useId() };
  const stock = Number(values.stock) || 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.size}>Pack size</Label>
        <Input id={ids.size} className="h-10" value={values.size} placeholder="e.g. 1 kg" onChange={(e) => onChange({ ...values, size: e.target.value })} />
        {showPresets && (
          <div className="flex flex-wrap gap-1.5">
            {COMMON_PACK_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...values, size: s })}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs transition-colors",
                  values.size === s ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.price}>Selling price</Label>
          <Input id={ids.price} className="h-10 tabular-nums" inputMode="decimal" placeholder="₹" value={values.price} onChange={(e) => onChange({ ...values, price: money(e.target.value) })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.mrp}>
            MRP <span className="font-normal text-muted-foreground">(opt.)</span>
          </Label>
          <Input id={ids.mrp} className="h-10 tabular-nums" inputMode="decimal" placeholder="₹" value={values.mrp} onChange={(e) => onChange({ ...values, mrp: money(e.target.value) })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <Label htmlFor={ids.stock}>In stock</Label>
          <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-border focus-within:ring-2 focus-within:ring-ring">
            <button
              type="button"
              aria-label="One less"
              onClick={() => onChange({ ...values, stock: String(Math.max(0, stock - 1)) })}
              className="flex w-10 shrink-0 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Minus className="size-4" aria-hidden />
            </button>
            <input
              id={ids.stock}
              inputMode="numeric"
              value={values.stock}
              onChange={(e) => onChange({ ...values, stock: whole(e.target.value) })}
              className="min-w-0 flex-1 bg-background text-center text-sm tabular-nums outline-none"
            />
            <button
              type="button"
              aria-label="One more"
              onClick={() => onChange({ ...values, stock: String(stock + 1) })}
              className="flex w-10 shrink-0 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
      {extra}
    </div>
  );
}

function checkPack(values: { size: string; price: string; mrp: string }): string | null {
  if (!values.size.trim()) return "Enter the pack size, like 1 kg.";
  if (!(Number(values.price) > 0)) return "Enter the selling price.";
  if (values.mrp && Number(values.mrp) < Number(values.price)) return "Selling price can't be more than the MRP.";
  return null;
}

function PackEditor({ variant, onDone }: { variant: Variant; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState({
    size: variant.size,
    price: String(variant.priceInPaise / 100),
    mrp: variant.mrpInPaise === null ? "" : String(variant.mrpInPaise / 100),
    stock: String(variant.stockQuantity),
  });
  const [sku, setSku] = useState(variant.sku);
  const [alertAt, setAlertAt] = useState(String(variant.lowStockThreshold));
  const [error, setError] = useState<string | null>(null);
  const skuId = useId();
  const alertId = useId();

  function run(fn: () => Promise<{ success: boolean; error?: { message: string } }>, done: string, close = true) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error?.message ?? "Couldn't save.");
        router.refresh();
        return;
      }
      toast.success(done);
      if (close) onDone();
      router.refresh();
    });
  }

  function save() {
    const problem = checkPack(values);
    if (problem) return setError(problem);
    run(
      () =>
        updateVariantAction({
          id: variant.id,
          size: values.size.trim(),
          sku: sku.trim(),
          priceInRupees: values.price,
          mrpInRupees: values.mrp ? values.mrp : null,
          stockQuantity: values.stock || 0,
          expectedStockQuantity: variant.stockQuantity,
          lowStockThreshold: alertAt || 0,
        }) as Promise<{ success: boolean; error?: { message: string } }>,
      `${values.size.trim()} saved`,
    );
  }

  function remove() {
    if (!window.confirm(`Delete the ${variant.size} pack? This can't be undone.`)) return;
    run(() => deleteVariantAction({ id: variant.id }) as Promise<{ success: boolean; error?: { message: string } }>, `${variant.size} deleted`);
  }

  return (
    <div className="flex flex-col gap-4 bg-secondary/30 p-4">
      <PackFields
        values={values}
        onChange={setValues}
        extra={
          <details className="group">
            <summary className="flex h-9 w-fit cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              More
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={alertId}>Warn me when stock is at</Label>
                <Input id={alertId} className="h-10 tabular-nums" inputMode="numeric" value={alertAt} onChange={(e) => setAlertAt(whole(e.target.value))} />
                <p className="text-xs text-muted-foreground">Shows as running low at or below this.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={skuId}>Product code</Label>
                <Input id={skuId} className="h-10 font-mono text-xs" value={sku} onChange={(e) => setSku(e.target.value)} />
                <p className="text-xs text-muted-foreground">Made automatically. Change it only if you use barcodes or your own codes.</p>
              </div>
            </div>
          </details>
        }
      />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="h-10 min-w-24" disabled={isPending} onClick={save}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={isPending}
            onClick={() =>
              run(
                () => setVariantActiveAction({ id: variant.id, isActive: !variant.isActive }) as Promise<{ success: boolean; error?: { message: string } }>,
                variant.isActive ? `${variant.size} hidden from website` : `${variant.size} back on website`,
              )
            }
          >
            {variant.isActive ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {variant.isActive ? "Hide" : "Show"}
          </Button>
          <Button type="button" variant="ghost" className="h-10 text-muted-foreground hover:text-destructive" disabled={isPending} onClick={remove} aria-label={`Delete ${variant.size}`}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PackRow({ variant, editing, onEdit, onDone }: { variant: Variant; editing: boolean; onEdit: () => void; onDone: () => void }) {
  const stock = stockText(variant);
  const off = variant.mrpInPaise !== null && variant.mrpInPaise > variant.priceInPaise ? variant.mrpInPaise - variant.priceInPaise : 0;
  return (
    <li className="border-t border-border first:border-t-0">
      {editing ? (
        <PackEditor variant={variant} onDone={onDone} />
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            "group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none",
            !variant.isActive && "opacity-55",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium">
              {variant.size}
              {!variant.isActive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  <EyeOff className="size-3" aria-hidden />
                  Hidden
                </span>
              )}
            </p>
            <p className={cn("mt-0.5 text-sm", stock.className)}>{stock.text}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums">{formatPaise(variant.priceInPaise)}</p>
            {variant.mrpInPaise !== null && (
              <p className="text-xs text-muted-foreground tabular-nums">
                MRP <span className={off ? "line-through" : ""}>{formatPaise(variant.mrpInPaise)}</span>
                {off > 0 && <span className="ml-1 text-emerald-400">{formatPaise(off)} off</span>}
              </p>
            )}
          </div>
          <Pencil className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" aria-hidden />
        </button>
      )}
    </li>
  );
}

function AddPack({ productId, onDone }: { productId: string; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState({ size: "", price: "", mrp: "", stock: "" });
  const [error, setError] = useState<string | null>(null);

  function add() {
    const problem = checkPack(values);
    if (problem) return setError(problem);
    setError(null);
    startTransition(async () => {
      const result = await createVariantAction({
        productId,
        size: values.size.trim(),
        priceInRupees: values.price,
        mrpInRupees: values.mrp ? values.mrp : null,
        stockQuantity: values.stock || 0,
      });
      if (!result.success) return setError(result.error.message);
      toast.success(`${values.size.trim()} added`);
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border bg-secondary/30 p-4">
      <PackFields values={values} onChange={setValues} showPresets />
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" className="h-10" disabled={isPending} onClick={add}>
          {isPending ? "Adding…" : "Add pack size"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * A product's pack sizes: each row shows the selling price (with MRP and
 * the saving), and stock in words. Tap a row to change price or stock
 * right there; hiding or deleting a size lives inside the editor so it's
 * never one stray tap away.
 */
export function ProductVariantsManager({ productId, variants }: { productId: string; variants: Variant[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {variants.length === 0 && !adding ? (
        <div className="p-6 text-center">
          <p className="text-sm font-medium">No pack sizes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add one so customers can buy it.</p>
        </div>
      ) : (
        <ul>
          {variants.map((v) => (
            <PackRow
              key={v.id}
              variant={v}
              editing={editingId === v.id}
              onEdit={() => {
                setAdding(false);
                setEditingId(v.id);
              }}
              onDone={() => setEditingId(null)}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <AddPack productId={productId} onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          className="flex h-12 w-full items-center justify-center gap-2 border-t border-border text-sm font-medium text-primary transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
        >
          <Plus className="size-4" aria-hidden />
          Add pack size
        </button>
      )}
    </div>
  );
}
