"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { FulfillmentType, OrderStatus } from "@prisma/client";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nextStep, nextStepLabel, simpleStatusLabel } from "@/lib/order-queue";
import { cn } from "@/lib/utils";
import { updateOrderStatusAction } from "@/server/actions/admin/orders";

/**
 * Moves an order one step forward (Accept → Start packing → Ready →
 * Collected/Delivered) in one tap — on the Orders list rows and as the
 * main button on an order's page. Uses the same server action and
 * transition rules as the full status controls. Renders nothing once the
 * order has no forward step.
 */
export function OrderNextStepButton({
  orderNumber,
  status,
  fulfillmentType,
  size = "sm",
  className,
}: {
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  size?: "sm" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const to = nextStep(status, fulfillmentType);
  if (!to) return null;

  function advance() {
    if (isPending || !to) return;
    startTransition(async () => {
      const result = await updateOrderStatusAction({ orderNumber, newStatus: to });
      if (result.success) {
        toast.success(`${orderNumber}: ${simpleStatusLabel(to, fulfillmentType)}.`);
        router.refresh();
      } else {
        toast.error(result.error.message);
        router.refresh();
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={advance}
      disabled={isPending}
      variant={size === "lg" ? "default" : "outline"}
      className={cn(size === "lg" ? "h-12 w-full text-base" : "h-9 shrink-0", className)}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {nextStepLabel(to, fulfillmentType)}
      {size === "lg" && !isPending && <ArrowRight className="size-4" aria-hidden />}
    </Button>
  );
}
