"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldOff } from "lucide-react";
import { anonymizeCustomerAction } from "@/server/actions/admin/customers";

/**
 * Personal-data audit (2026-08-10) — the one UI entry point for erasing a
 * customer's personal data on request. Mirrors this codebase's own
 * established destructive-action pattern exactly (e.g.
 * `CategoryRow`'s delete button, src/components/admin/category-manager.tsx):
 * a plain button, a `window.confirm` explaining what will and won't
 * happen, `useTransition` + `sonner` toast for the result, `router.refresh()`
 * on success — no new interaction pattern introduced for this one action.
 */
export function AnonymizeCustomerButton({ customerId, displayLabel }: { customerId: string; displayLabel: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (isPending) return;
    const confirmed = window.confirm(
      `Erase ${displayLabel}'s personal data (name, phone numbers, saved address)? ` +
        "This cannot be undone. Their past orders, returns, and payment records are kept — this only removes their profile's contact details.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await anonymizeCustomerAction({ id: customerId });
      if (result.success) {
        toast.success("Customer data erased.");
        router.refresh();
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
      className="flex h-9 items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:pointer-events-none disabled:opacity-50"
    >
      <ShieldOff className="size-4" aria-hidden />
      {isPending ? "Erasing…" : "Erase Personal Data"}
    </button>
  );
}
