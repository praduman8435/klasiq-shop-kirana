import {
  RETURN_REASON_LABEL,
  RETURN_REQUEST_STATUS_BADGE_CLASS,
  RETURN_REQUEST_STATUS_LABEL,
} from "@/lib/return-lifecycle";
import { cn } from "@/lib/utils";
import type { ReturnRequestStatus, ReturnRequestType } from "@prisma/client";

type ReturnHistoryEntry = {
  id: string;
  returnNumber: string;
  type: ReturnRequestType;
  status: ReturnRequestStatus;
  rejectionReason: string | null;
  createdAt: Date;
  items: {
    quantity: number;
    reason: string;
    orderItem: { productName: string; size: string };
    replacementVariant: { size: string; product: { name: string } } | null;
  }[];
};

export function ReturnHistory({ requests }: { requests: ReturnHistoryEntry[] }) {
  if (requests.length === 0) return null;

  return (
    <section aria-labelledby="return-history-heading" className="flex flex-col gap-3">
      <h2 id="return-history-heading" className="font-heading text-base font-semibold">
        Return &amp; Exchange Requests
      </h2>
      <ul className="flex flex-col gap-3">
        {requests.map((request) => (
          <li key={request.id} className="rounded-lg border bg-card p-3.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm font-medium">{request.returnNumber}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {request.type === "EXCHANGE" ? "Exchange" : "Return"}
                  {" · "}
                  {request.createdAt.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                  RETURN_REQUEST_STATUS_BADGE_CLASS[request.status],
                )}
              >
                {RETURN_REQUEST_STATUS_LABEL[request.status]}
              </span>
            </div>
            {request.status === "REJECTED" && request.rejectionReason && (
              <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                <span className="font-medium">Reason: </span>
                {request.rejectionReason}
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-1.5 border-t pt-3">
              {request.items.map((item, index) => (
                <li key={index} className="text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {item.orderItem.productName} &middot; Size {item.orderItem.size} &middot; Qty {item.quantity}
                    </span>
                    <span>{RETURN_REASON_LABEL[item.reason as keyof typeof RETURN_REASON_LABEL]}</span>
                  </div>
                  {item.replacementVariant && (
                    <p className="mt-0.5 text-foreground">
                      Replacement: {item.replacementVariant.product.name} &middot; Size{" "}
                      {item.replacementVariant.size}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
