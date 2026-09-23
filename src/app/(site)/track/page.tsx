import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrackOrdersForm } from "@/components/customer-portal/track-orders-form";
import { getCustomerSession } from "@/lib/customer-portal/session";

export const metadata: Metadata = {
  title: "Track your orders",
  robots: { index: false, follow: false },
};

/**
 * The single public entry point into the customer portal — see
 * docs/PHASE_3_4_REPORT.md "Portal route decision" for why this one route
 * (not a separate /login-style page) handles the whole phone -> OTP flow,
 * mirroring /admin/login's role but for a customer-facing, no-password
 * flow. Already-authenticated visitors are sent straight to the portal
 * shell instead of being asked to verify again.
 */
export default async function TrackOrdersPage() {
  const session = await getCustomerSession();
  if (session) {
    redirect("/track/orders");
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Track your order
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the mobile number used when placing your order.
        </p>
      </div>
      <TrackOrdersForm />
    </div>
  );
}
