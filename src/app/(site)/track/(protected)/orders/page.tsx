import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { OrderCard } from "@/components/customer-portal/order-card";
import { PortalHeader } from "@/components/customer-portal/portal-header";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { isActiveOrder } from "@/lib/customer-portal/order-status-copy";
import { getCustomerKhataDue } from "@/server/khatabook/payment-claims";
import { getOrdersForAuthenticatedCustomer } from "@/server/queries/customer-portal/orders";

export const metadata: Metadata = {
  title: "My Orders",
  robots: { index: false, follow: false },
};

/**
 * My Orders: orders still on their way first (so "where is it?" is
 * answered without scrolling), then everything bought before, each with
 * "Order again" — most kirana shopping is the same staples again.
 */
export default async function TrackOrdersPortalPage() {
  const session = await getCustomerSession();
  if (!session) return null;

  const [orders, dueInPaise] = session.customer
    ? await Promise.all([
        getOrdersForAuthenticatedCustomer(session.customer.id),
        getCustomerKhataDue(session.customer.id),
      ])
    : [[], 0];

  const active = orders.filter((o) => isActiveOrder(o.status, o.fulfillmentType));
  const past = orders.filter((o) => !isActiveOrder(o.status, o.fulfillmentType));

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PortalHeader
        name={session.customer?.displayName ?? null}
        phone={session.phoneNormalized}
        active="orders"
        dueInPaise={dueInPaise}
      />

      {orders.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-border bg-card px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep">
            <ShoppingBag className="size-7" aria-hidden />
          </span>
          <p className="mt-4 text-lg font-extrabold">No orders on this number yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Orders placed online or billed at the shop with this mobile number will show up here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-base font-extrabold text-primary-foreground hover:bg-brand-deep"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section aria-labelledby="active-heading" className="flex flex-col gap-3">
              <h2 id="active-heading" className="font-heading text-lg font-extrabold">
                On the way
              </h2>
              <ul className="flex flex-col gap-3">
                {active.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="past-heading" className="flex flex-col gap-3">
              <h2 id="past-heading" className="font-heading text-lg font-extrabold">
                {active.length > 0 ? "Past orders" : "Your orders"}
              </h2>
              <ul className="flex flex-col gap-3">
                {past.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
