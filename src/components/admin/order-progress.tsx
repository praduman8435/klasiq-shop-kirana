import type { FulfillmentType, OrderStatus } from "@prisma/client";
import { getOrderTracking } from "@/lib/order-tracking";
import { simpleStatusLabel } from "@/lib/order-queue";
import { cn } from "@/lib/utils";

/** Where an online order is, as a short step bar: New → Accepted →
 * Packing → Ready/On the way → Collected/Delivered. Nothing for counter
 * sales (done at the counter) and a plain note for cancelled orders. */
export function OrderProgress({ status, fulfillmentType }: { status: OrderStatus; fulfillmentType: FulfillmentType }) {
  const tracking = getOrderTracking(fulfillmentType, status);
  if (tracking.kind === "counterCompleted") return null;
  if (tracking.kind === "cancelled") {
    return <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">This order was cancelled.</p>;
  }
  return (
    <ol className="flex gap-1" aria-label="Order progress">
      {tracking.stages.map((stage) => (
        <li key={stage.status} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={stage.state === "current" ? "step" : undefined}>
          <span
            aria-hidden
            className={cn(
              "h-1.5 rounded-full",
              stage.state === "future"
                ? "bg-muted"
                : stage.state === "current" && status !== "DELIVERED"
                  ? "bg-primary"
                  : "bg-emerald-500",
            )}
          />
          <span
            className={cn(
              "truncate text-[11px] leading-tight",
              stage.state === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {simpleStatusLabel(stage.status, fulfillmentType)}
          </span>
        </li>
      ))}
    </ol>
  );
}
