"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
    <Button variant="outline" onClick={handleLogout} disabled={isPending}>
      {isPending ? "Logging out..." : "Logout"}
    </Button>
  );
}
