"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { FulfillmentType, OrderStatus, PaymentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  ORDER_STATUS_ACTION_LABEL,
  PAYMENT_STATUS_ACTION_LABEL,
  nextValidOrderStatuses,
  nextValidPaymentStatuses,
} from "@/lib/order-lifecycle";
import {
  updateOrderStatusAction,
  updatePaymentStatusAction,
} from "@/server/actions/admin/orders";

export function OrderStatusActions({
  orderNumber,
  status,
  fulfillmentType,
}: {
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const nextStatuses = nextValidOrderStatuses({ from: status, fulfillmentType });

  function handleTransition(newStatus: OrderStatus) {
    if (isPending) return;
    if (newStatus === "CANCELLED") {
      const confirmed = window.confirm(
        "Cancel this order? This restores stock for every item in it. This cannot be undone from here.",
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await updateOrderStatusAction({ orderNumber, newStatus });
      if (result.success) {
        toast.success(`Order marked ${ORDER_STATUS_ACTION_LABEL[newStatus].toLowerCase()}.`);
        router.refresh();
      } else {
        toast.error(result.error.message);
        if (result.error.type === "CONFLICT") router.refresh();
      }
    });
  }

  if (nextStatuses.length === 0) {
    return <p className="text-sm text-muted-foreground">No further actions — this order is closed.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((next) => (
        <Button
          key={next}
          type="button"
          variant={next === "CANCELLED" ? "destructive" : "default"}
          disabled={isPending}
          onClick={() => handleTransition(next)}
        >
          {ORDER_STATUS_ACTION_LABEL[next]}
        </Button>
      ))}
    </div>
  );
}

export function PaymentStatusActions({
  orderNumber,
  paymentStatus,
  orderStatus,
}: {
  orderNumber: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // A cancelled order can still be moved to REFUNDED if it was already
  // paid, but never freshly marked PAID — mirrors the server-side rule in
  // updatePaymentStatus (which remains the actual enforcement point).
  const nextStatuses = nextValidPaymentStatuses(paymentStatus).filter(
    (status) => !(orderStatus === "CANCELLED" && status === "PAID"),
  );

  function handleTransition(newPaymentStatus: PaymentStatus) {
    if (isPending) return;
    startTransition(async () => {
      const result = await updatePaymentStatusAction({ orderNumber, newPaymentStatus });
      if (result.success) {
        toast.success(`Payment marked ${PAYMENT_STATUS_ACTION_LABEL[newPaymentStatus].toLowerCase()}.`);
        router.refresh();
      } else {
        toast.error(result.error.message);
        if (result.error.type === "CONFLICT") router.refresh();
      }
    });
  }

  if (nextStatuses.length === 0) {
    return <p className="text-sm text-muted-foreground">No further payment actions available.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((next) => (
        <Button
          key={next}
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => handleTransition(next)}
        >
          {PAYMENT_STATUS_ACTION_LABEL[next]}
        </Button>
      ))}
    </div>
  );
}
