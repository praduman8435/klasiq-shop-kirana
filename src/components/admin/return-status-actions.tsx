"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ReturnRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RETURN_REQUEST_STATUS_ACTION_LABEL, nextValidReturnStatuses } from "@/lib/return-lifecycle";
import { updateReturnRequestStatusAction } from "@/server/actions/admin/returns";

export function ReturnStatusActions({
  returnNumber,
  status,
}: {
  returnNumber: string;
  status: ReturnRequestStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  // RECEIVED/COMPLETED are deliberately excluded from this generic
  // bare-transition button set — Phase 3.5 Part 4 ties both to real
  // inventory reconciliation, only reachable via the dedicated
  // ReturnReceivePanel/receiveReturnRequestAction. See
  // docs/PHASE_3_5_REPORT.md Part 4 "Inventory strategy".
  const nextStatuses = nextValidReturnStatuses(status).filter(
    (next) => next !== "RECEIVED" && next !== "COMPLETED",
  );

  function runTransition(newStatus: ReturnRequestStatus, reason?: string) {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateReturnRequestStatusAction({
        returnNumber,
        newStatus,
        ...(reason ? { rejectionReason: reason } : {}),
      });
      if (result.success) {
        toast.success(`Request marked ${RETURN_REQUEST_STATUS_ACTION_LABEL[newStatus].toLowerCase()}.`);
        setRejecting(false);
        setRejectionReason("");
        router.refresh();
      } else {
        toast.error(result.error.message);
        if ("type" in result.error && result.error.type === "CONFLICT") router.refresh();
      }
    });
  }

  function handleClick(newStatus: ReturnRequestStatus) {
    if (newStatus === "REJECTED") {
      setRejecting(true);
      return;
    }
    if (newStatus === "CANCELLED") {
      const confirmed = window.confirm("Cancel this return/exchange request? This cannot be undone from here.");
      if (!confirmed) return;
    }
    runTransition(newStatus);
  }

  if (nextStatuses.length === 0 && !rejecting) {
    return <p className="text-sm text-muted-foreground">No further actions — this request is closed.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((next) => (
          <Button
            key={next}
            type="button"
            variant={next === "REJECTED" || next === "CANCELLED" ? "destructive" : "default"}
            disabled={isPending}
            onClick={() => handleClick(next)}
          >
            {RETURN_REQUEST_STATUS_ACTION_LABEL[next]}
          </Button>
        ))}
      </div>

      {rejecting && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/20 p-3">
          <Label htmlFor="rejection-reason">Rejection reason (required, shown to the customer)</Label>
          <textarea
            id="rejection-reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. Item received without original packaging"
            className="rounded-md border border-input bg-background p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !rejectionReason.trim()}
              onClick={() => runTransition("REJECTED", rejectionReason)}
            >
              {isPending ? "Rejecting..." : "Confirm Rejection"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setRejecting(false);
                setRejectionReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
