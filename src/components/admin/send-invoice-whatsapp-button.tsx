"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendInvoiceWhatsAppAction } from "@/server/actions/admin/invoice";

/**
 * Section 3 — the ONE UI implementation shared by every "Send Invoice
 * over WhatsApp" entry point (Counter Sale Success screen, Admin Order
 * Detail, Admin Invoice page), mirroring `OrderStatusActions`/
 * `PaymentStatusActions`'s own established
 * `useTransition` + `sonner` toast convention
 * (src/components/admin/order-status-actions.tsx) — no new
 * loading/feedback pattern was invented for this button.
 */
export function SendInvoiceWhatsAppButton({ orderNumber, className }: { orderNumber: string; className?: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending) return;
    startTransition(async () => {
      const result = await sendInvoiceWhatsAppAction({ orderNumber });
      if (result.success) {
        toast.success("Invoice sent over WhatsApp.");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
      {isPending ? "Sending…" : "Send via WhatsApp"}
    </button>
  );
}
