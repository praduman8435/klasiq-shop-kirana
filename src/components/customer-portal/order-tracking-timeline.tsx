import { Check, Circle } from "lucide-react";
import { getOrderTracking } from "@/lib/order-tracking";
import { cn } from "@/lib/utils";
import type { FulfillmentType, OrderStatus } from "@prisma/client";

export function OrderTrackingTimeline({
  fulfillmentType,
  status,
}: {
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
}) {
  const tracking = getOrderTracking(fulfillmentType, status);

  if (tracking.kind === "cancelled") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-medium">Cancelled</p>
        <p className="mt-1 text-destructive/80">This order was cancelled and will not be fulfilled further.</p>
      </div>
    );
  }

  if (tracking.kind === "counterCompleted") {
    return (
      <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
        <p className="font-medium text-foreground">Purchased in Store</p>
        <p className="mt-1 text-muted-foreground">Completed at time of purchase.</p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3" aria-label="Order tracking">
      {tracking.stages.map((stage) => (
        <li key={stage.status} className="flex items-center gap-3" aria-current={stage.state === "current" ? "step" : undefined}>
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full",
              stage.state === "completed" && "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
              stage.state === "current" && "border-2 border-primary text-primary",
              stage.state === "future" && "border-2 border-muted-foreground/30 text-muted-foreground/50",
            )}
          >
            {stage.state === "completed" ? (
              <Check className="size-3.5" />
            ) : (
              <Circle className="size-2 fill-current" />
            )}
          </span>
          <span
            className={cn(
              "text-sm",
              stage.state === "future" ? "text-muted-foreground" : "font-medium text-foreground",
            )}
          >
            {stage.label}
            {stage.state === "current" && <span className="ml-1.5 text-xs text-primary">(current)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
