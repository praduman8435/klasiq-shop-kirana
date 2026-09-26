import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookOpen, Package, RotateCcw } from "lucide-react";
import { TrackOrdersForm } from "@/components/customer-portal/track-orders-form";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { isCustomerOtpRequired } from "@/server/customer-portal/phone-login";

export const metadata: Metadata = {
  title: "Your orders & khata",
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
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <div className="rounded-3xl bg-card p-5 shadow-[0_1px_3px_oklch(0.2_0.006_270/8%)] sm:p-7">
        <div className="mb-6">
          <h1 className="font-heading text-3xl font-extrabold leading-none tracking-[-0.015em]">Your orders &amp; khata</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter the mobile number you shop with.</p>
        </div>
        <TrackOrdersForm otpRequired={isCustomerOtpRequired()} />
        <ul className="mt-6 grid gap-2.5 border-t border-border pt-5 text-sm">
          {[
            { icon: Package, text: "See where your order is, or cancel it" },
            { icon: RotateCcw, text: "Order the same things again in one tap" },
            { icon: BookOpen, text: "Check your udhaar and pay it by UPI" },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-muted-foreground">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
                <Icon className="size-4" aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
