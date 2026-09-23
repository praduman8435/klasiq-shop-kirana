import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Order Link Incomplete",
  robots: { index: false, follow: false },
};

/**
 * Reached when someone visits /order/[orderNumber] without the access
 * token segment — e.g. they typed just the order number from memory. The
 * order number alone is never enough to view an order (see "Order lookup
 * security" in docs/PHASE_2_REPORT.md), so this explains what's missing
 * instead of a bare 404 or, worse, actually looking the order up.
 */
export default function OrderNumberOnlyPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">
        This link is missing your confirmation code
      </h1>
      <p className="mt-2 text-muted-foreground">
        For your privacy, an order number on its own can&apos;t open an order.
        Please use the full link from your order confirmation page or
        WhatsApp message.
      </p>
      <Button render={<Link href="/" />} nativeButton={false} className="mt-6">
        Back to home
      </Button>
    </div>
  );
}
