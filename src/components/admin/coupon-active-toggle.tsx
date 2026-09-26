"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setCouponActiveAction } from "@/server/actions/admin/coupons";

/** On/off for an offer, right in the list. */
export function CouponActiveToggle({ id, code, isActive }: { id: string; code: string; isActive: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-label={`${code} ${isActive ? "on" : "off"}`}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setCouponActiveAction({ id, isActive: !isActive });
          if (!result.success) return void toast.error(result.message);
          toast.success(isActive ? `${code} paused` : `${code} is on`);
          router.refresh();
        })
      }
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        isActive ? "bg-primary" : "bg-secondary",
      )}
    >
      <span className={cn("absolute top-0.5 left-0 size-5 rounded-full bg-white shadow transition-transform", isActive ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}
