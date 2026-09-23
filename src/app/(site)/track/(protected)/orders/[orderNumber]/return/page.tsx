import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReturnRequestForm } from "@/components/customer-portal/return-request-form";
import { getOrderReturnEligibility } from "@/lib/return-eligibility";
import { RETURN_WINDOW_DAYS } from "@/lib/return-lifecycle";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { getOrderForAuthenticatedCustomer } from "@/server/queries/customer-portal/orders";
import { getReturnableItemsForOrder } from "@/server/queries/customer-portal/returns";

type PageProps = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Return · ${orderNumber}`, robots: { index: false, follow: false } };
}

/**
 * Same IDOR-safe shape as the order-detail page: `notFound()` for both a
 * nonexistent order number AND one belonging to a different customer,
 * indistinguishable either way (see getOrderForAuthenticatedCustomer's doc
 * comment, Phase 3.4 Part 2). Eligibility is computed here ONLY to decide
 * what explanation to show — the actual authorization/validation happens
 * again, server-side, in createReturnRequest when the form submits (see
 * that function's own doc comment) — this page's checks are UX only.
 */
export default async function ReturnOrderPage({ params }: PageProps) {
  const { orderNumber } = await params;
  const session = await getCustomerSession();
  if (!session) return null;
  if (!session.customer) notFound();

  const order = await getOrderForAuthenticatedCustomer(orderNumber, session.customer.id);
  if (!order) notFound();

  const items = await getReturnableItemsForOrder(orderNumber, session.customer.id);
  if (!items) notFound();

  const orderEligibility = getOrderReturnEligibility({
    orderStatus: order.status,
    deliveredAt: order.deliveredAt,
    now: new Date(),
  });

  let ineligibleReason: string | null = null;
  if (!orderEligibility.eligible) {
    ineligibleReason =
      orderEligibility.error.type === "ORDER_NOT_DELIVERED"
        ? "This order hasn't been delivered yet, so it isn't eligible for return or exchange."
        : `The return window (${RETURN_WINDOW_DAYS} days after delivery) for this order has passed.`;
  } else if (items.every((item) => !item.eligible)) {
    ineligibleReason = "Every item on this order has already been fully claimed by a return or exchange request.";
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10 sm:px-6">
      <Link
        href={`/track/orders/${orderNumber}`}
        className="flex h-11 w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Order {orderNumber}
      </Link>

      <div>
        <h1 className="font-heading text-xl font-semibold">Return / Exchange</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the items you&apos;d like to return or exchange.
        </p>
      </div>

      <ReturnRequestForm orderNumber={orderNumber} items={items} orderIneligibleReason={ineligibleReason} />
    </div>
  );
}
