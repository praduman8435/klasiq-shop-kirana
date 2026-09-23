import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Order-detail-specific 404 for the authenticated portal — without this,
 * an order number that doesn't exist OR belongs to a different customer
 * (see getOrderForAuthenticatedCustomer's own doc comment for why those
 * two cases are deliberately indistinguishable) fell through to the
 * generic site-wide not-found.tsx, whose "search for your school" copy
 * doesn't fit someone already inside their own order history. Copy here
 * stays equally non-revealing between the two cases.
 */
export default function OrderDetailNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-semibold">
        We couldn&apos;t find this order
      </h1>
      <p className="mt-2 text-muted-foreground">
        This order may not exist, or it isn&apos;t linked to this account.
      </p>
      <Button render={<Link href="/track/orders" />} nativeButton={false} className="mt-6 h-11 w-full sm:w-auto">
        Back to My Orders
      </Button>
    </div>
  );
}
