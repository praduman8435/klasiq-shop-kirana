"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";
import { STOCK_STATUS_LABEL, STOCK_STATUS_TEXT_CLASS } from "@/lib/stock";
import { cn } from "@/lib/utils";
import {
  adjustInventoryByDeltaAction,
  setInventoryQuantityAction,
} from "@/server/actions/admin/inventory";

export type InventoryRowData = {
  id: string;
  productName: string;
  categoryName: string;
  size: string;
  sku: string;
  priceInPaise: number;
  stockQuantity: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
};

export function InventoryRow({ item }: { item: InventoryRowData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "receive" | "set">("idle");
  const [inputValue, setInputValue] = useState("");

  function runDelta(delta: number, reason: "STOCK_RECEIVED" | "MANUAL_CORRECTION") {
    if (isPending) return;
    startTransition(async () => {
      const result = await adjustInventoryByDeltaAction({ productVariantId: item.id, delta, reason });
      if (result.success) {
        toast.success(`Stock updated to ${result.newQuantity}.`);
        setMode("idle");
        setInputValue("");
        router.refresh();
      } else {
        toast.error(result.error.message);
        router.refresh();
      }
    });
  }

  function runSet() {
    const newQuantity = Number.parseInt(inputValue, 10);
    if (Number.isNaN(newQuantity) || newQuantity < 0) {
      toast.error("Enter a valid stock count.");
      return;
    }
    if (isPending) return;
    startTransition(async () => {
      const result = await setInventoryQuantityAction({
        productVariantId: item.id,
        newQuantity,
        expectedPreviousQuantity: item.stockQuantity,
        reason: "MANUAL_CORRECTION",
      });
      if (result.success) {
        toast.success(`Stock set to ${result.newQuantity}.`);
        setMode("idle");
        setInputValue("");
        router.refresh();
      } else {
        toast.error(result.error.message);
        router.refresh();
      }
    });
  }

  function runReceive() {
    const received = Number.parseInt(inputValue, 10);
    if (Number.isNaN(received) || received <= 0) {
      toast.error("Enter how many units arrived.");
      return;
    }
    runDelta(received, "STOCK_RECEIVED");
  }

  const parsedInput = Number.parseInt(inputValue, 10);
  const hasValidInput = !Number.isNaN(parsedInput) && parsedInput >= 0;
  const receiveResultingStock = mode === "receive" && hasValidInput && parsedInput > 0 ? item.stockQuantity + parsedInput : null;
  const setResultingStock = mode === "set" && hasValidInput ? parsedInput : null;

  const stockLabel = `${item.stockQuantity} · ${STOCK_STATUS_LABEL[item.stockStatus]}`;

  const stepper = (
    <div className="flex h-8 shrink-0 items-center rounded-md border border-border">
      <button
        type="button"
        aria-label={`Decrease stock for ${item.productName} size ${item.size}`}
        disabled={isPending || item.stockQuantity <= 0}
        onClick={() => runDelta(-1, "MANUAL_CORRECTION")}
        className="flex h-full w-7 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-40"
      >
        <Minus className="size-3.5" aria-hidden />
      </button>
      <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums">{item.stockQuantity}</span>
      <button
        type="button"
        aria-label={`Increase stock for ${item.productName} size ${item.size}`}
        disabled={isPending}
        onClick={() => runDelta(1, "MANUAL_CORRECTION")}
        className="flex h-full w-7 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-40"
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );

  const actionButtons = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={isPending}
        onClick={() => {
          setInputValue("");
          setMode(mode === "receive" ? "idle" : "receive");
        }}
      >
        <Package className="size-3.5" aria-hidden />
        Receive stock
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8"
        disabled={isPending}
        onClick={() => {
          setInputValue(String(item.stockQuantity));
          setMode(mode === "set" ? "idle" : "set");
        }}
      >
        Set exact
      </Button>
    </>
  );

  const expandPanel = mode !== "idle" && (
    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/20 p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`${item.id}-${mode}`}>
          {mode === "receive" ? "Quantity received" : "New stock count"}
        </label>
        <Input
          id={`${item.id}-${mode}`}
          type="number"
          inputMode="numeric"
          min={mode === "set" ? 0 : 1}
          autoFocus
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="h-9 w-28"
          placeholder={mode === "receive" ? "e.g. 10" : "e.g. 25"}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {mode === "receive" ? (
          receiveResultingStock !== null ? (
            <>
              {item.stockQuantity} → <span className="font-medium text-foreground">{receiveResultingStock}</span>
            </>
          ) : (
            `Current stock: ${item.stockQuantity}`
          )
        ) : setResultingStock !== null ? (
          <>
            {item.stockQuantity} → <span className="font-medium text-foreground">{setResultingStock}</span>
          </>
        ) : (
          `Current stock: ${item.stockQuantity}`
        )}
      </p>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={isPending}
          onClick={mode === "receive" ? runReceive : runSet}
        >
          {mode === "receive" ? "Receive stock" : "Set stock"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9"
          disabled={isPending}
          onClick={() => {
            setMode("idle");
            setInputValue("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <li className="px-4 py-3">
      {/* Mobile — compact stacked block. */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.productName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.categoryName} · Size {item.size} · SKU {item.sku}
            </p>
          </div>
          <span className={cn("shrink-0 text-right text-xs font-medium", STOCK_STATUS_TEXT_CLASS[item.stockStatus])}>
            {stockLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{formatPaise(item.priceInPaise)}</span>
          {stepper}
        </div>
        <div className="flex items-center gap-2">{actionButtons}</div>
        {expandPanel}
      </div>

      {/* Desktop — operational table row. */}
      <div className="hidden sm:flex sm:flex-col">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.productName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.categoryName} · Size {item.size} · SKU {item.sku}
            </p>
          </div>
          <span className="w-20 shrink-0 text-right text-sm">{formatPaise(item.priceInPaise)}</span>
          <span className={cn("w-28 shrink-0 text-right text-sm", STOCK_STATUS_TEXT_CLASS[item.stockStatus])}>
            {stockLabel}
          </span>
          <div className="flex w-[320px] shrink-0 items-center justify-end gap-2">
            {stepper}
            {actionButtons}
          </div>
        </div>
        {expandPanel}
      </div>
    </li>
  );
}
