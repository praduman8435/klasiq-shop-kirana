import type { Metadata } from "next";
import Link from "next/link";
import { CustomerLogoutButton } from "@/components/customer-portal/logout-button";
import { OrderHistoryCard } from "@/components/customer-portal/order-history-card";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { getOrdersForAuthenticatedCustomer } from "@/server/queries/customer-portal/orders";

export const metadata: Metadata = {
  title: "My Orders",
  robots: { index: false, follow: false },
};

/**
 * The authenticated My Orders list — every order genuinely linked to this
 * verified session's Customer (both ONLINE checkouts and customer-linked
 * COUNTER sales; see docs/PHASE_3_4_REPORT.md Part 2 "Linked purchase
 * history"), newest first. A verified phone with no matching Customer
 * record gets a friendly, generic empty state — never a fabricated
 * Customer, never an internal distinction the customer doesn't need to
 * see (docs/PHASE_3_4_REPORT.md Part 1 "Customer resolution after OTP").
 */
export default async function TrackOrdersPortalPage() {
  const session = await getCustomerSession();
  // The layout above already redirects when there's no session — this is
  // purely to satisfy the type system's non-null narrowing, not a second
  // authorization check.
  if (!session) return null;

  const orders = session.customer
    ? await getOrdersForAuthenticatedCustomer(session.customer.id)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {session.customer?.displayName ? `Welcome, ${session.customer.displayName}` : "My Orders"}
          </h1>
          {session.customer && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Klasiq Customer Reference: {session.customer.customerId}
            </p>
          )}
        </div>
        <CustomerLogoutButton />
      </div>

      {orders.length > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {orders.length} order{orders.length === 1 ? "" : "s"}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <p className="text-sm font-medium text-foreground">No orders found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn&apos;t find any Klasiq orders linked to this number.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-lg border px-5 font-medium text-foreground transition-colors hover:bg-muted"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {orders.map((order) => (
            <OrderHistoryCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}
