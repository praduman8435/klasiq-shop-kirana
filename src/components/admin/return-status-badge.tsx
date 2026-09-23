import type { ReturnRequestStatus, ReturnRequestType } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { RETURN_REQUEST_STATUS_BADGE_CLASS, RETURN_REQUEST_STATUS_LABEL } from "@/lib/return-lifecycle";
import { cn } from "@/lib/utils";

const RETURN_REQUEST_TYPE_LABEL: Record<ReturnRequestType, string> = {
  RETURN: "Return",
  EXCHANGE: "Exchange",
};

const RETURN_REQUEST_TYPE_CLASS: Record<ReturnRequestType, string> = {
  RETURN: "bg-secondary text-secondary-foreground",
  EXCHANGE: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
};

export function ReturnStatusBadge({ status, className }: { status: ReturnRequestStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", RETURN_REQUEST_STATUS_BADGE_CLASS[status], className)}>
      {RETURN_REQUEST_STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * `className` lets a caller quiet this badge relative to the status badge
 * (the Returns list/detail redesign) without editing the shared color
 * map — same additive pattern as `OrderSourceBadge`
 * (src/components/admin/order-status-badge.tsx).
 */
export function ReturnTypeBadge({ type, className }: { type: ReturnRequestType; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", RETURN_REQUEST_TYPE_CLASS[type], className)}>
      {RETURN_REQUEST_TYPE_LABEL[type]}
    </Badge>
  );
}
