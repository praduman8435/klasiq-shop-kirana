"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { validateReceivePaymentAmount } from "@/lib/receive-payment";
import { cn } from "@/lib/utils";
import { COUNTER_SALE_PAYMENT_METHOD_VALUES } from "@/lib/validation/admin-counter-sale";
import { receivePaymentAction } from "@/server/actions/admin/receive-payment";

type PaymentMethodValue = (typeof COUNTER_SALE_PAYMENT_METHOD_VALUES)[number];

const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ReceivablePaymentOrder = { orderNumber: string; outstandingInPaise: number };

/**
 * Section 2's "Simple dialog" — Order (only when the customer has more
 * than one balance due; auto-selected when there's exactly one), Amount,
 * Payment Method, optional Note, Save. Built on the SAME `@base-ui/react`
 * dialog primitive `Sheet` already uses (`src/components/ui/sheet.tsx`),
 * just centered instead of edge-docked — see `src/components/ui/dialog.tsx`.
 */
export function ReceivePaymentDialog({
  customerId,
  unpaidOrders,
}: {
  customerId: string;
  unpaidOrders: ReceivablePaymentOrder[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [orderNumber, setOrderNumber] = useState(unpaidOrders[0]?.orderNumber ?? "");
  const [amountRupees, setAmountRupees] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>("CASH");
  const [note, setNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [formError, setFormError] = useState<string | null>(null);

  const orderIdBase = useId();
  const amountId = useId();
  const amountErrorId = useId();
  const noteId = useId();

  const selectedOrder = unpaidOrders.find((o) => o.orderNumber === orderNumber) ?? null;

  // Live preview only, via the SAME function receivePayment independently
  // re-runs server-side — never trusted as the final amount.
  const rupees = Number(amountRupees);
  const amountInPaise = Number.isFinite(rupees) && amountRupees.trim() !== "" ? rupeesToPaise(rupees) : null;
  let previewError: string | null = null;
  if (selectedOrder && amountInPaise !== null) {
    const error = validateReceivePaymentAmount({
      amountInPaise,
      outstandingInPaise: selectedOrder.outstandingInPaise,
    });
    previewError = error?.message ?? null;
  }

  function resetForm() {
    setOrderNumber(unpaidOrders[0]?.orderNumber ?? "");
    setAmountRupees("");
    setPaymentMethod("CASH");
    setNote("");
    setIdempotencyKey(generateIdempotencyKey());
    setFormError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedOrder) {
      setFormError("Select which order this payment is for.");
      return;
    }
    if (amountInPaise === null) {
      setFormError("Enter an amount.");
      return;
    }
    const validationError = validateReceivePaymentAmount({
      amountInPaise,
      outstandingInPaise: selectedOrder.outstandingInPaise,
    });
    if (validationError) {
      setFormError(validationError.message);
      return;
    }

    setFormError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof receivePaymentAction>>;
      try {
        result = await receivePaymentAction({
          orderNumber: selectedOrder.orderNumber,
          customerId,
          amountInPaise,
          paymentMethod,
          note: note.trim() || undefined,
          idempotencyKey,
        });
      } catch {
        const message =
          "Could not confirm this payment — check your connection. Before retrying, check the Ledger to see if it already went through.";
        setFormError(message);
        toast.error(message);
        return;
      }

      if (result.success) {
        toast.success("Payment recorded.");
        handleOpenChange(false);
        router.refresh();
        return;
      }
      setFormError(result.error.message);
      toast.error(result.error.message);
    });
  }

  if (unpaidOrders.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="lg" className="gap-2">
            <HandCoins className="size-4" aria-hidden />
            Receive Payment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive Payment</DialogTitle>
          <DialogDescription>Record a payment against an outstanding balance.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{formError}</p>
            </div>
          )}

          {unpaidOrders.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={orderIdBase}>Order</Label>
              <select
                id={orderIdBase}
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {unpaidOrders.map((order) => (
                  <option key={order.orderNumber} value={order.orderNumber}>
                    {order.orderNumber} — {formatPaise(order.outstandingInPaise)} due
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Order <span className="font-mono">{unpaidOrders[0]!.orderNumber}</span> —{" "}
              {formatPaise(unpaidOrders[0]!.outstandingInPaise)} due
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={amountId}>Amount received (₹)</Label>
            <Input
              id={amountId}
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              placeholder="0"
              className="h-11 text-base"
              autoFocus
              aria-invalid={Boolean(previewError)}
              aria-describedby={previewError ? amountErrorId : undefined}
            />
            {previewError && (
              <p id={amountErrorId} className="text-xs text-destructive">
                {previewError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Payment method</Label>
            <div className="grid grid-cols-3 gap-2">
              {COUNTER_SALE_PAYMENT_METHOD_VALUES.map((method) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "h-11 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    paymentMethod === method
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PAYMENT_METHOD_LABEL[method]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>Note (optional)</Label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid at pickup"
              rows={2}
              maxLength={200}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              size="lg"
              disabled={isPending || Boolean(previewError) || !amountRupees}
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
