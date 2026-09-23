import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * This route renders outside every layout group (see page.tsx's own doc
 * comment), so without this it fell through to the chrome-free global
 * `not-found.tsx` — fine in isolation, but now visually inconsistent with
 * this page's own storefront background. Copy matches
 * track/(protected)/orders/[orderNumber]/not-found.tsx: equally
 * non-revealing whether the order doesn't exist or simply isn't linked
 * to this account (see getInvoiceForAuthenticatedCustomer's own doc
 * comment for why those two cases must stay indistinguishable).
 */
export default function InvoiceNotFound() {
  return (
    <div className="store-theme flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-semibold">
          We couldn&apos;t find this invoice
        </h1>
        <p className="mt-2 text-muted-foreground">
          This invoice may not exist, or it isn&apos;t linked to this account.
        </p>
        <Button render={<Link href="/track/orders" />} nativeButton={false} className="mt-6 h-11 w-full sm:w-auto">
          Back to My Orders
        </Button>
      </div>
    </div>
  );
}
