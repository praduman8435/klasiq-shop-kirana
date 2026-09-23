import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Order-confirmation-specific 404 — without this, an invalid/expired
 * order link fell through to the generic site-wide not-found.tsx, which
 * prompts to "search for your school," an odd message for someone who
 * was trying to view an order. Deliberately generic about WHY the link
 * didn't work (wrong order number and a wrong/mismatched access token
 * both land here identically — see getOrderByNumberAndToken's own doc
 * comment for why that's a security requirement, not an oversight),
 * while still pointing at the real, existing ways to find an order.
 */
export default function OrderConfirmationNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-semibold">
        We couldn&apos;t find this order
      </h1>
      <p className="mt-2 text-muted-foreground">
        This link may be incomplete, outdated, or no longer valid. If you have
        an order with us, you can verify your mobile number to view it.
      </p>
      <Button render={<Link href="/track" />} nativeButton={false} className="mt-6 h-11 w-full sm:w-auto">
        Track My Orders
      </Button>
      <Link
        href="/"
        className="mt-4 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Continue Shopping
      </Link>
    </div>
  );
}
