import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReturnAdminNote } from "@/components/admin/return-admin-note";
import { ReturnReceivePanel } from "@/components/admin/return-receive-panel";
import { ReturnStatusActions } from "@/components/admin/return-status-actions";
import { ReturnStatusBadge, ReturnTypeBadge } from "@/components/admin/return-status-badge";
import { formatPaise } from "@/lib/money";
import { effectivePriceForQuantity } from "@/lib/discount";
import { getExchangePriceDifference, PRICE_DIFFERENCE_TYPE_LABEL } from "@/lib/exchange-price";
import { RETURN_REASON_LABEL, RETURN_REQUEST_STATUS_LABEL } from "@/lib/return-lifecycle";
import { cn } from "@/lib/utils";
import { getAdminReturnRequestByNumber, getReturnRequestsForCustomer } from "@/server/queries/admin/returns";
import { getOrdersForAuthenticatedCustomer } from "@/server/queries/customer-portal/orders";

type PageProps = { params: Promise<{ returnNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { returnNumber } = await params;
  return { title: returnNumber };
}

type TimelineStep = { label: string; at: Date; by: string | null };

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Phase 3.5 Part 5 — Price Difference Foundation. Admin-only display (see
 * docs/PHASE_3_5_REPORT.md Part 5 "Customer history" for why this never
 * reaches the customer portal in this phase): purely informational, NO
 * payment is ever charged/refunded here — `getExchangePriceDifference`
 * only ever computes a number, never moves money.
 *
 * Phase 3.6.5 Part 2 — `originalValueInPaise` is the EFFECTIVE
 * (post-discount) value of the returned quantity, derived via
 * `effectivePriceForQuantity` (src/lib/discount.ts) from the order item's
 * immutable `effectiveLineTotalInPaise` snapshot — never the catalog
 * `unitPriceInPaise` × quantity. See "Exchanges" in
 * docs/PHASE_3_6_5_REPORT.md Part 2 for why. `replacementValueInPaise`
 * remains a plain catalog-price × quantity — the replacement is a NEW
 * item at its own current price, no discount carries over to it.
 */
function PriceDifferenceSummary({
  originalValueInPaise,
  replacementValueInPaise,
}: {
  originalValueInPaise: number;
  replacementValueInPaise: number;
}) {
  const diff = getExchangePriceDifference({ originalValueInPaise, replacementValueInPaise });
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Price difference: {formatPaise(diff.originalValueInPaise)} &rarr; {formatPaise(diff.replacementValueInPaise)}
      {" · "}
      <span className="font-medium text-foreground">{PRICE_DIFFERENCE_TYPE_LABEL[diff.type]}</span>
      {diff.type !== "EQUAL_VALUE" && ` (${formatPaise(Math.abs(diff.differenceInPaise))})`}
    </p>
  );
}

function buildTimeline(request: NonNullable<Awaited<ReturnType<typeof getAdminReturnRequestByNumber>>>) {
  const steps: TimelineStep[] = [{ label: "Request Created", at: request.createdAt, by: null }];
  if (request.overriddenAt) {
    steps.push({
      label: "Admin Override Applied",
      at: request.overriddenAt,
      by: request.overriddenByAdminUser?.name ?? null,
    });
  }
  if (request.approvedAt) {
    steps.push({ label: "Approved", at: request.approvedAt, by: request.approvedByAdminUser?.name ?? null });
  }
  if (request.rejectedAt) {
    steps.push({ label: "Rejected", at: request.rejectedAt, by: request.rejectedByAdminUser?.name ?? null });
  }
  if (request.receivedAt) {
    steps.push({ label: "Received", at: request.receivedAt, by: request.receivedByAdminUser?.name ?? null });
  }
  if (request.completedAt) {
    steps.push({ label: "Completed", at: request.completedAt, by: request.completedByAdminUser?.name ?? null });
  }
  if (request.cancelledAt) {
    steps.push({ label: "Cancelled", at: request.cancelledAt, by: request.cancelledByAdminUser?.name ?? null });
  }
  return steps;
}

export default async function AdminReturnDetailPage({ params }: PageProps) {
  const { returnNumber } = await params;
  const request = await getAdminReturnRequestByNumber(returnNumber);
  if (!request) notFound();

  const [customerReturnHistory, customerOrders] = await Promise.all([
    getReturnRequestsForCustomer(request.customerId),
    getOrdersForAuthenticatedCustomer(request.customerId),
  ]);

  const orderItemById = new Map(request.order.items.map((item) => [item.id, item]));
  const timeline = buildTimeline(request);
  const otherReturnHistory = customerReturnHistory.filter((r) => r.id !== request.id);
  const isClosed = request.status === "COMPLETED" || request.status === "REJECTED" || request.status === "CANCELLED";

  return (
    // AdminShell establishes the dark scope + background for the whole
    // admin application; this page just renders directly into it.
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href="/admin/returns"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Returns
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-mono text-lg font-semibold">{request.returnNumber}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{formatDateTime(request.createdAt)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ReturnStatusBadge status={request.status} />
            <ReturnTypeBadge type={request.type} className="opacity-70" />
          </div>
        </div>
      </div>

      {request.status === "REJECTED" && request.rejectionReason && (
        <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <h2 className="text-sm font-semibold text-destructive">Rejection reason</h2>
          <p className="mt-1 text-sm text-destructive">{request.rejectionReason}</p>
          <p className="mt-1 text-xs text-destructive/80">Visible to the customer in their order history.</p>
        </div>
      )}

      {request.overriddenAt && (
        <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <h2 className="text-sm font-semibold text-amber-500">Admin Override</h2>
          <p className="mt-1 text-sm text-foreground">{request.overrideReason}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Delivery/return-window eligibility was bypassed by{" "}
            {request.overriddenByAdminUser?.name ?? "an admin"} at {formatDateTime(request.overriddenAt)}. Quantity
            limits were never bypassed.
          </p>
        </div>
      )}

      {/* Requested items/inventory/timeline/history are the primary
          content (left/main); status+action, customer, order, and
          internal notes are the sidebar — always visible, never
          requiring a scroll past the items to act on the request. Same
          two-column + `lg:sticky` technique as Orders/Counter Sale. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex flex-1 flex-col gap-5 lg:max-w-2xl">
          <section>
            <h2 className="text-sm font-semibold">Requested items</h2>
            <ul className="mt-2 divide-y divide-border">
              {request.items.map((requestItem) => {
                const orderItem = orderItemById.get(requestItem.orderItemId);
                const purchasedQuantity = orderItem?.quantity ?? requestItem.orderItem.quantity;
                const totalClaimed = orderItem?.returnClaimedQuantity ?? requestItem.orderItem.returnClaimedQuantity;
                // "Already returned" here means claimed by OTHER requests —
                // this request's own claimed quantity is excluded so the two
                // figures never double-count the same units. Never re-derived
                // from live Product/ProductVariant data — purchasedQuantity
                // and totalClaimed both come straight from the historical
                // OrderItem snapshot (Phase 1/3.5 Part 1), exactly like the
                // customer portal's own eligibility display.
                const alreadyReturnedElsewhere = Math.max(0, totalClaimed - requestItem.quantity);
                const remaining = Math.max(0, purchasedQuantity - totalClaimed);
                // Section 14 — "effective item pricing," never the catalog
                // unitPriceInPaise: the value of THIS requested quantity out
                // of the line's own immutable, post-discount snapshot.
                const effectiveValueInPaise = effectivePriceForQuantity({
                  effectiveLineTotalInPaise: requestItem.orderItem.effectiveLineTotalInPaise,
                  purchasedQuantity,
                  requestedQuantity: requestItem.quantity,
                });
                return (
                  <li key={requestItem.id} className="py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{requestItem.orderItem.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          Size {requestItem.orderItem.size} &middot; SKU {requestItem.orderItem.skuSnapshot}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Reason: <span className="text-foreground">{RETURN_REASON_LABEL[requestItem.reason]}</span>
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-xs text-muted-foreground">
                        Requested Qty
                        <br />
                        <span className="text-sm font-semibold text-foreground">{requestItem.quantity}</span>
                      </p>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
                      <span>
                        Purchased
                        <br />
                        <span className="text-sm font-medium text-foreground">{purchasedQuantity}</span>
                      </span>
                      <span>
                        Already returned
                        <br />
                        <span className="text-sm font-medium text-foreground">{alreadyReturnedElsewhere}</span>
                      </span>
                      <span>
                        Remaining
                        <br />
                        <span className="text-sm font-medium text-foreground">{remaining}</span>
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Effective value ({requestItem.quantity} × {formatPaise(requestItem.orderItem.unitPriceInPaise)}{" "}
                      catalog): <span className="font-medium text-foreground">{formatPaise(effectiveValueInPaise)}</span>
                    </p>
                    {requestItem.replacementVariant && requestItem.replacementUnitPriceInPaiseSnapshot !== null && (
                      <PriceDifferenceSummary
                        originalValueInPaise={effectiveValueInPaise}
                        replacementValueInPaise={
                          requestItem.replacementUnitPriceInPaiseSnapshot * requestItem.quantity
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {request.note && (
              <div className="mt-3 rounded-md border border-border bg-secondary/20 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">Customer note</p>
                <p className="mt-1">{request.note}</p>
              </div>
            )}
          </section>

          {request.inventoryAdjustments.length > 0 && (
            <>
              <div className="border-t border-border" />
              <section>
                <h2 className="text-sm font-semibold">Inventory impact</h2>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {request.items.map((item) => (
                    <li key={item.id}>
                      <p>
                        Restored to inventory: <span className="font-medium">{item.quantity}</span> ×{" "}
                        {item.orderItem.productName} · Size {item.orderItem.size}
                      </p>
                      {item.replacementVariant && (
                        <p className="mt-0.5 text-muted-foreground">
                          Replacement issued: <span className="font-medium text-foreground">{item.quantity}</span> ×{" "}
                          {item.replacementVariant.product.name} · Size {item.replacementVariant.size}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-xs font-medium text-muted-foreground">Stock movements</p>
                <ul className="mt-1 divide-y divide-border text-sm">
                  {request.inventoryAdjustments.map((adj) => (
                    <li key={adj.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        {adj.productVariant.product.name} · Size {adj.productVariant.size}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {adj.reason.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </span>
                      <span className={cn("font-medium", adj.delta >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {adj.delta >= 0 ? `+${adj.delta}` : adj.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Timeline</h2>
            <ol className="mt-2 flex flex-col">
              {timeline.map((step, index) => {
                const isLast = index === timeline.length - 1;
                return (
                  <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
                    {!isLast && (
                      <span className="absolute top-2.5 left-[3px] h-full w-px bg-border" aria-hidden />
                    )}
                    <span
                      className={cn(
                        "relative z-10 mt-1.5 size-1.5 shrink-0 rounded-full",
                        isLast ? "bg-primary" : "bg-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <div className="flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <span className={cn("text-sm", isLast ? "font-semibold" : "font-medium")}>{step.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(step.at)}
                        {step.by ? ` · ${step.by}` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Customer history</h2>
            <div className="mt-2 flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchase history</p>
                {customerOrders.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">No other orders.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {customerOrders.map((order) => (
                      <li key={order.id} className="flex items-center gap-2 text-sm">
                        <Link
                          href={`/admin/orders/${order.orderNumber}`}
                          className="font-mono font-medium text-primary hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Other returns &amp; exchanges
                </p>
                {otherReturnHistory.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">None.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {otherReturnHistory.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-sm">
                        <Link
                          href={`/admin/returns/${r.returnNumber}`}
                          className="font-mono font-medium text-primary hover:underline"
                        >
                          {r.returnNumber}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {RETURN_REQUEST_STATUS_LABEL[r.status]} &middot; Order {r.order.orderNumber}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-5 border-t border-border pt-5 lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <section>
            <h2 className="text-sm font-semibold">Status</h2>
            {isClosed ? (
              <p className="mt-1 text-sm text-muted-foreground">No further action required.</p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Currently {RETURN_REQUEST_STATUS_LABEL[request.status]}.
              </p>
            )}
            <div className="mt-2 flex flex-col gap-3">
              <ReturnStatusActions returnNumber={request.returnNumber} status={request.status} />
              {request.status === "APPROVED" && (
                <ReturnReceivePanel
                  returnNumber={request.returnNumber}
                  type={request.type}
                  items={request.items.map((item) => ({
                    id: item.id,
                    productName: item.orderItem.productName,
                    size: item.orderItem.size,
                    quantity: item.quantity,
                  }))}
                />
              )}
            </div>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Customer</h2>
            <p className="mt-1.5 text-sm">{request.customer.displayName ?? "—"}</p>
            <p className="text-sm text-muted-foreground">{request.customer.primaryPhone ?? "—"}</p>
            <p className="mt-1 text-xs font-mono text-muted-foreground">{request.customer.customerId}</p>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Order</h2>
            <Link
              href={`/admin/orders/${request.order.orderNumber}`}
              className="mt-1.5 inline-block font-mono text-sm font-medium text-primary hover:underline"
            >
              {request.order.orderNumber}
            </Link>
            <p className="text-sm text-muted-foreground">{formatDateTime(request.order.createdAt)}</p>
            {request.order.school && (
              <p className="mt-1 text-xs text-muted-foreground">School: {request.order.school.name}</p>
            )}
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Internal notes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Admin-only — the customer never sees this.</p>
            <div className="mt-2">
              <ReturnAdminNote returnNumber={request.returnNumber} initialNote={request.adminNote ?? ""} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
