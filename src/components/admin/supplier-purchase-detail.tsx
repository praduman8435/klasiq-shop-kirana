"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, ImageOff, PackagePlus, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/components/admin/supplier-payment-detail";
import {
  addSupplierPurchaseBillAttachmentAction,
  removeSupplierPurchaseBillAttachmentAction,
  updateSupplierPurchaseBillAction,
  updateSupplierPurchaseDetailsAction,
} from "@/server/actions/admin/supplier-purchases";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

function toIsoDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

type Attachment = { id: string; url: string; originalFilename: string | null };
type Bill = {
  id: string;
  billNumber: string | null;
  billDate: Date;
  amountInPaise: number;
  notes: string | null;
  attachments: Attachment[];
};
type Purchase = {
  id: string;
  purchaseDate: Date;
  reference: string | null;
  notes: string | null;
  totalInPaise: number;
  bills: Bill[];
  supplier: { id: string; name: string };
};
type PurchasePaymentHistoryRow = {
  allocationId: string;
  amountInPaise: number;
  payment: { id: string; paymentDate: Date; paymentMethod: string; collectedByName: string };
};
type ReceivingSummary = { totalReceivedUnits: number; receiptCount: number; lastReceivedAt: Date | null };
type ReceiptHistoryRow = {
  id: string;
  receivedAt: Date;
  reference: string | null;
  totalUnits: number;
  itemCount: number;
  createdByAdminUserName: string | null;
};
type ReturnSummary = { totalReturnedUnits: number; returnCount: number; lastReturnedAt: Date | null };
type ReturnHistoryRow = {
  id: string;
  returnNumber: string;
  returnDate: Date;
  reason: string;
  status: string;
  totalUnits: number;
};
type CreditAllocationHistoryRow = {
  allocationId: string;
  amountInPaise: number;
  credit: { id: string; creditNumber: string; creditDate: Date; reason: string };
};

const CREDIT_REASON_LABEL: Record<string, string> = {
  SUPPLIER_RETURN: "Supplier return",
  OVERPAYMENT: "Overpayment",
  PRICE_ADJUSTMENT: "Price adjustment",
  QUALITY_ADJUSTMENT: "Quality adjustment",
  COMMERCIAL_ADJUSTMENT: "Commercial adjustment",
  OTHER: "Other",
};

const RETURN_REASON_LABEL: Record<string, string> = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  WRONG_SIZE: "Wrong size",
  DEFECTIVE: "Defective",
  EXCESS_QUANTITY: "Excess quantity",
  QUALITY_ISSUE: "Quality issue",
  SUPPLIER_REQUEST: "Supplier request",
  OTHER: "Other",
};

function PurchaseSummaryEdit({ purchase, onDone }: { purchase: Purchase; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [purchaseDate, setPurchaseDate] = useState(toIsoDateInput(purchase.purchaseDate));
  const [reference, setReference] = useState(purchase.reference ?? "");
  const [notes, setNotes] = useState(purchase.notes ?? "");
  const dateId = useId();
  const referenceId = useId();
  const notesId = useId();

  function handleSave() {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateSupplierPurchaseDetailsAction({
        id: purchase.id,
        purchaseDate,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      if (result.success) {
        toast.success("Purchase updated.");
        onDone();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor={dateId}>Purchase date</Label>
          <Input id={dateId} type="date" className="h-9" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor={referenceId}>Reference (optional)</Label>
          <Input id={referenceId} className="h-9" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notesId}>Notes (optional)</Label>
        <Input id={notesId} className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-9" disabled={isPending} onClick={handleSave}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-9" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AttachmentThumb({ attachment, onRemove, removing }: { attachment: Attachment; onRemove: () => void; removing: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary/20">
      {broken ? (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <ImageOff className="size-5" aria-hidden />
        </div>
      ) : (
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" aria-label={`Open attachment ${attachment.originalFilename || ""}`.trim()}>
          {/* eslint-disable-next-line @next/next/no-img-element -- pasted external URL, not an optimizable local/known-domain asset */}
          <img src={attachment.url} alt={attachment.originalFilename || "Bill attachment"} className="size-full object-cover" onError={() => setBroken(true)} />
        </a>
      )}
      <button
        type="button"
        aria-label={`Remove attachment ${attachment.originalFilename || attachment.url}`}
        disabled={removing}
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-destructive disabled:opacity-40"
      >
        <Trash2 className="size-3" aria-hidden />
      </button>
    </div>
  );
}

function AddAttachmentInline({ billId }: { billId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const urlId = useId();

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed || isPending) return;
    startTransition(async () => {
      const result = await addSupplierPurchaseBillAttachmentAction({ billId, url: trimmed });
      if (result.success) {
        setUrl("");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" aria-hidden />
        Add bill image
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={urlId} className="sr-only">
        Image URL
      </Label>
      <Input id={urlId} className="h-8 w-56 text-sm" placeholder="Paste image URL" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      <Button type="button" size="sm" className="h-8" disabled={isPending || !url.trim()} onClick={handleAdd}>
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8" disabled={isPending} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

function BillEditForm({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [billNumber, setBillNumber] = useState(bill.billNumber ?? "");
  const [billDate, setBillDate] = useState(toIsoDateInput(bill.billDate));
  const [amount, setAmount] = useState(String(bill.amountInPaise / 100));
  const [notes, setNotes] = useState(bill.notes ?? "");
  const numberId = useId();
  const dateId = useId();
  const amountId = useId();
  const notesId = useId();

  function handleSave() {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateSupplierPurchaseBillAction({
        id: bill.id,
        billNumber: billNumber || undefined,
        billDate,
        amountInRupees: Number(amount),
        notes: notes || undefined,
      });
      if (result.success) {
        toast.success("Bill updated.");
        onDone();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor={numberId}>Bill number (optional)</Label>
          <Input id={numberId} className="h-9" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor={dateId}>Bill date</Label>
          <Input id={dateId} type="date" className="h-9" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor={amountId}>Amount (₹)</Label>
          <Input id={amountId} type="number" step="0.01" min={0} className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notesId}>Notes (optional)</Label>
        <Input id={notesId} className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-9" disabled={isPending} onClick={handleSave}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-9" disabled={isPending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BillCard({ bill }: { bill: Bill }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function handleRemoveAttachment(attachmentId: string) {
    setRemovingId(attachmentId);
    removeSupplierPurchaseBillAttachmentAction({ id: attachmentId }).then((result) => {
      setRemovingId(null);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {editing ? (
        <BillEditForm bill={bill} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{bill.billNumber ? `Bill #${bill.billNumber}` : "Bill (no number)"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{DATE_FORMATTER.format(bill.billDate)}</p>
              {bill.notes && <p className="mt-1 text-xs text-muted-foreground">{bill.notes}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold">{formatPaise(bill.amountInPaise)}</span>
              <button
                type="button"
                aria-label={`Edit bill ${bill.billNumber || ""}`.trim()}
                onClick={() => setEditing(true)}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {bill.attachments.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {bill.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <AttachmentThumb attachment={attachment} removing={removingId === attachment.id} onRemove={() => handleRemoveAttachment(attachment.id)} />
                  </li>
                ))}
              </ul>
            )}
            <AddAttachmentInline billId={bill.id} />
          </div>
        </>
      )}
    </div>
  );
}

export function SupplierPurchaseDetail({
  purchase,
  paidInPaise,
  creditsAppliedInPaise,
  outstandingInPaise,
  paymentHistory,
  receivingSummary,
  receiptHistory,
  returnSummary,
  returnHistory,
  creditHistory,
}: {
  purchase: Purchase;
  paidInPaise: number;
  creditsAppliedInPaise: number;
  outstandingInPaise: number;
  paymentHistory: PurchasePaymentHistoryRow[];
  receivingSummary: ReceivingSummary;
  receiptHistory: ReceiptHistoryRow[];
  returnSummary: ReturnSummary;
  returnHistory: ReturnHistoryRow[];
  creditHistory: CreditAllocationHistoryRow[];
}) {
  const [editingSummary, setEditingSummary] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Purchase summary</h2>
          {!editingSummary && (
            <button
              type="button"
              aria-label="Edit purchase details"
              onClick={() => setEditingSummary(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {editingSummary ? (
          <PurchaseSummaryEdit purchase={purchase} onDone={() => setEditingSummary(false)} />
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Purchase date</dt>
              <dd className="mt-0.5 font-medium">{DATE_FORMATTER.format(purchase.purchaseDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="mt-0.5 font-medium">{formatPaise(purchase.totalInPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Paid</dt>
              <dd className="mt-0.5 font-medium">{formatPaise(paidInPaise)}</dd>
            </div>
            {creditsAppliedInPaise > 0 && (
              <div>
                <dt className="text-xs text-muted-foreground">Credits Applied</dt>
                <dd className="mt-0.5 font-medium text-sky-600 dark:text-sky-400">{formatPaise(creditsAppliedInPaise)}</dd>
              </div>
            )}
            <div>
              {/* Section 15 — Outstanding = Total - Payments allocated -
                  Credits allocated, never a stored figure (see
                  getPurchasePaymentInfo's own doc comment). The
                  purchase's own totalInPaise is never modified here. */}
              <dt className="text-xs text-muted-foreground">Outstanding</dt>
              <dd className={cn("mt-0.5 font-medium", outstandingInPaise > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                {formatPaise(Math.max(0, outstandingInPaise))}
              </dd>
            </div>
            {purchase.reference && (
              <div>
                <dt className="text-xs text-muted-foreground">Reference</dt>
                <dd className="mt-0.5 font-medium">{purchase.reference}</dd>
              </div>
            )}
            {purchase.notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="mt-0.5">{purchase.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Bills ({purchase.bills.length})
        </h2>
        <div className="flex flex-col gap-3">
          {purchase.bills.map((bill) => (
            <BillCard key={bill.id} bill={bill} />
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Total</span>
        <span className="text-lg font-semibold">{formatPaise(purchase.totalInPaise)}</span>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payment history</h2>
          {outstandingInPaise > 0 && (
            <Link
              href={`/admin/suppliers/${purchase.supplier.id}/payments/new`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Record Payment
            </Link>
          )}
        </div>
        {paymentHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">No payments recorded against this purchase yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {paymentHistory.map((row) => (
                <li key={row.allocationId}>
                  <Link
                    href={`/admin/suppliers/${purchase.supplier.id}/payments/${row.payment.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{DATE_FORMATTER.format(row.payment.paymentDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABEL[row.payment.paymentMethod] ?? row.payment.paymentMethod} · Collected by: {row.payment.collectedByName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold">{formatPaise(row.amountInPaise)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Phase 4 Part 6 — deliberately its OWN section, never merged into
          Payment history above: "Do not merge payments and credits into
          one ambiguous list." */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Credit allocations</h2>
          {outstandingInPaise > 0 && (
            <Link
              href={`/admin/suppliers/${purchase.supplier.id}/credits/new`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Record Credit
            </Link>
          )}
        </div>
        {creditHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">No credits applied against this purchase yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {creditHistory.map((row) => (
                <li key={row.allocationId}>
                  <Link
                    href={`/admin/suppliers/${purchase.supplier.id}/credits/${row.credit.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{DATE_FORMATTER.format(row.credit.creditDate)} · #{row.credit.creditNumber}</p>
                      <p className="text-xs text-muted-foreground">{CREDIT_REASON_LABEL[row.credit.reason] ?? row.credit.reason}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-sky-600 dark:text-sky-400">{formatPaise(row.amountInPaise)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Phase 4 Part 4 — Inventory section is deliberately visually
          distinct from "Record Payment" above: emerald "positive stock
          movement" color, PackagePlus icon, its own heading. Never
          shows a fabricated "pending" quantity — a SupplierPurchase has
          no expected-quantity concept at all (see
          getPurchaseReceivingSummary's own doc comment), so only what
          was actually received is ever shown. */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Inventory</h2>
          <div className="flex items-center gap-2">
            <Button
              render={<Link href={`/admin/suppliers/${purchase.supplier.id}/purchases/${purchase.id}/returns/new`} />}
              nativeButton={false}
              size="sm"
              variant="outline"
              className="h-8 border-amber-600/40 text-amber-600 hover:bg-amber-600/10 dark:text-amber-400"
            >
              <Undo2 className="size-3.5" aria-hidden />
              Return to Supplier
            </Button>
            <Button
              render={<Link href={`/admin/suppliers/${purchase.supplier.id}/purchases/${purchase.id}/receive`} />}
              nativeButton={false}
              size="sm"
              className="h-8 bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-600 dark:hover:bg-emerald-600/90"
            >
              <PackagePlus className="size-3.5" aria-hidden />
              Receive Inventory
            </Button>
          </div>
        </div>

        {/* Section 12 — "Net Received" only ever appears once something
            has actually been received (never a fabricated figure): it's
            simply receivedUnits - returnedUnits, both already derived
            from real receipt/return rows, never its own stored column. */}
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="mt-0.5 text-lg font-semibold">{receivingSummary.totalReceivedUnits} units</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Supplier Returned</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-600 dark:text-amber-400">{returnSummary.totalReturnedUnits} units</p>
          </div>
          {receivingSummary.totalReceivedUnits > 0 && (
            <div className="bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Net Received</p>
              <p className="mt-0.5 text-lg font-semibold">{receivingSummary.totalReceivedUnits - returnSummary.totalReturnedUnits} units</p>
            </div>
          )}
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Receiving events</p>
            <p className="mt-0.5 text-lg font-semibold">{receivingSummary.receiptCount}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Return events</p>
            <p className="mt-0.5 text-lg font-semibold">{returnSummary.returnCount}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Last received</p>
            <p className="mt-0.5 text-lg font-semibold">
              {receivingSummary.lastReceivedAt ? DATE_FORMATTER.format(receivingSummary.lastReceivedAt) : "—"}
            </p>
          </div>
        </div>

        {receiptHistory.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {receiptHistory.map((receipt) => (
                <li key={receipt.id}>
                  <Link
                    href={`/admin/suppliers/${purchase.supplier.id}/purchases/${purchase.id}/receive/${receipt.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{DATE_FORMATTER.format(receipt.receivedAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {receipt.itemCount} item{receipt.itemCount === 1 ? "" : "s"}
                        {receipt.createdByAdminUserName ? ` · Received by: ${receipt.createdByAdminUserName}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{receipt.totalUnits} units</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Supplier Returns</h2>
        {returnHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">No returns recorded against this purchase yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {returnHistory.map((supplierReturn) => (
                <li key={supplierReturn.id}>
                  <Link
                    href={`/admin/suppliers/${purchase.supplier.id}/purchases/${purchase.id}/returns/${supplierReturn.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {DATE_FORMATTER.format(supplierReturn.returnDate)} · #{supplierReturn.returnNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {RETURN_REASON_LABEL[supplierReturn.reason] ?? supplierReturn.reason}
                        {" · "}
                        {supplierReturn.status === "COMPLETED" ? "Completed" : "Cancelled"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">-{supplierReturn.totalUnits} units</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
