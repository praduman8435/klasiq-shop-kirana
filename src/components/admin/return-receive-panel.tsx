"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ReturnRequestType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CounterSaleProductSearch, type VariantSearchResult } from "@/components/admin/counter-sale-product-search";
import { receiveReturnRequestAction } from "@/server/actions/admin/returns";

type ReceiveItem = { id: string; productName: string; size: string; quantity: number };

/**
 * Section 7 "Receiving Items" — requires the admin to explicitly confirm
 * correct item/quantity/condition before anything happens server-side
 * ("Do not silently increase stock"). For an EXCHANGE, also requires
 * picking a real replacement variant per item (section 9 — reuses the
 * exact same product/variant search already built for Counter Sale,
 * `CounterSaleProductSearch`, so "only variants that genuinely exist,
 * never free-text inventory" is enforced by construction, not a second
 * search implementation). Submitting calls `receiveReturnRequestAction`,
 * which atomically reconciles inventory and moves the request to
 * COMPLETED — see docs/PHASE_3_5_REPORT.md Part 4 "Inventory strategy".
 */
export function ReturnReceivePanel({
  returnNumber,
  type,
  items,
}: {
  returnNumber: string;
  type: ReturnRequestType;
  items: ReceiveItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [replacements, setReplacements] = useState<Record<string, VariantSearchResult>>({});

  const isExchange = type === "EXCHANGE";
  const allReplacementsChosen = !isExchange || items.every((item) => replacements[item.id]);
  const canSubmit = confirmed && allReplacementsChosen;

  function handleSubmit() {
    if (isPending || !canSubmit) return;
    startTransition(async () => {
      const result = await receiveReturnRequestAction({
        returnNumber,
        ...(isExchange
          ? { replacements: Object.fromEntries(items.map((item) => [item.id, replacements[item.id]!.variantId])) }
          : {}),
      });
      if (result.success) {
        toast.success("Return received — inventory reconciled and the request is now Completed.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-secondary/20 p-3.5">
      <p className="text-sm font-medium">Receive Return</p>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="receive-confirm"
          checked={confirmed}
          onCheckedChange={(c) => setConfirmed(c === true)}
          className="mt-0.5"
        />
        <Label htmlFor="receive-confirm" className="text-sm font-normal">
          I&apos;ve confirmed the correct item(s), correct quantity, and acceptable physical condition.
        </Label>
      </div>

      {isExchange && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Choose a replacement for each item</p>
          {items.map((item) => {
            const chosen = replacements[item.id];
            return (
              <div key={item.id} className="rounded-lg border bg-card p-3">
                <p className="text-sm font-medium">
                  {item.productName} &middot; {item.size} &middot; Qty {item.quantity}
                </p>
                {chosen ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-2">
                    <p className="text-xs">
                      Replacement: {chosen.productName} &middot; {chosen.size}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setReplacements((prev) => {
                          const next = { ...prev };
                          delete next[item.id];
                          return next;
                        })
                      }
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <CounterSaleProductSearch
                      onAdd={(variant) => setReplacements((prev) => ({ ...prev, [item.id]: variant }))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Button type="button" disabled={isPending || !canSubmit} onClick={handleSubmit}>
        {isPending ? "Receiving..." : "Receive & Complete"}
      </Button>
    </div>
  );
}
