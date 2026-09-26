"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { customerLogoutAction } from "@/server/actions/customer-portal/auth";

export function CustomerLogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    if (isPending) return;
    startTransition(async () => {
      await customerLogoutAction();
      router.push("/track");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden />
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
