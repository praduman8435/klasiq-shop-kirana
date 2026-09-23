import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WalkInReturnForm } from "@/components/admin/walk-in-return-form";

export const metadata: Metadata = { title: "New Walk-in Return" };

/**
 * Section 5/6 "Walk-in returns" — a customer physically in the shop, no
 * prior website interaction. This page is just a shell around
 * `WalkInReturnForm`; every real piece of logic (search, eligibility,
 * creation) is the exact same code the customer portal and Admin Returns
 * dashboard already use — see that component's own doc comment.
 */
export default function AdminNewWalkInReturnPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/returns"
          className="flex h-9 w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Returns
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">New Walk-in Return</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For a customer returning or exchanging an item in person.
        </p>
      </div>

      <WalkInReturnForm />
    </div>
  );
}
