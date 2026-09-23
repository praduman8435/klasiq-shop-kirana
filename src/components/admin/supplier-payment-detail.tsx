"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import {
  addSupplierPaymentAttachmentAction,
  removeSupplierPaymentAttachmentAction,
  updateSupplierPaymentDetailsAction,
} from "@/server/actions/admin/supplier-payments";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
] as const;

export const PAYMENT_METHOD_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]),
);

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });
const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function toIsoDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

type Attachment = { id: string; url: string; originalFilename: string | null };
type Allocation = {
  id: string;
  amountInPaise: number;
  purchase: { id: string; purchaseDate: Date; reference: string | null; totalInPaise: number };
  purchaseOutstandingAfterInPaise: number;
};
type Payment = {
  id: string;
  supplierId: string;
  paymentDate: Date;
  amountInPaise: number;
  paymentMethod: string;
  collectedByName: string;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
  createdByAdminUser: { name: string } | null;
  allocations: Allocation[];
  attachments: Attachment[];
};

function PaymentDetailsEdit({ payment, onDone }: { payment: Payment; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [paymentDate, setPaymentDate] = useState(toIsoDateInput(payment.paymentDate));
  const [paymentMethod, setPaymentMethod] = useState(payment.paymentMethod);
  const [collectedByName, setCollectedByName] = useState(payment.collectedByName);
  const [reference, setReference] = useState(payment.reference ?? "");
  const [notes, setNotes] = useState(payment.notes ?? "");
  const dateId = useId();
  const methodId = useId();
  const collectedById = useId();
  const referenceId = useId();
  const notesId = useId();

  function handleSave() {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateSupplierPaymentDetailsAction({
        id: payment.id,
        paymentDate,
        paymentMethod,
        collectedByName,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      if (result.success) {
        toast.success("Payment updated.");
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
          <Label htmlFor={dateId}>Payment date</Label>
          <Input id={dateId} type="date" className="h-9" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor={methodId}>Payment method</Label>
          <select id={methodId} className={SELECT_CLASS} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {PAYMENT_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor={collectedById}>Collected by</Label>
          <Input id={collectedById} className="h-9" value={collectedByName} onChange={(e) => setCollectedByName(e.target.value)} />
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
          <img src={attachment.url} alt={attachment.originalFilename || "Payment proof"} className="size-full object-cover" onError={() => setBroken(true)} />
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

function AddAttachmentInline({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const urlId = useId();

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed || isPending) return;
    startTransition(async () => {
      const result = await addSupplierPaymentAttachmentAction({ paymentId, url: trimmed });
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
        Add image
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

export function SupplierPaymentDetail({ payment }: { payment: Payment }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function handleRemoveAttachment(attachmentId: string) {
    setRemovingId(attachmentId);
    removeSupplierPaymentAttachmentAction({ id: attachmentId }).then((result) => {
      setRemovingId(null);
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payment</h2>
          {!editing && (
            <button
              type="button"
              aria-label="Edit payment details"
              onClick={() => setEditing(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {editing ? (
          <PaymentDetailsEdit payment={payment} onDone={() => setEditing(false)} />
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Amount</dt>
              <dd className="mt-0.5 text-lg font-semibold">{formatPaise(payment.amountInPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Payment date</dt>
              <dd className="mt-0.5 font-medium">{DATE_FORMATTER.format(payment.paymentDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Payment method</dt>
              <dd className="mt-0.5 font-medium">{PAYMENT_METHOD_LABEL[payment.paymentMethod] ?? payment.paymentMethod}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Collected by</dt>
              <dd className="mt-0.5 font-medium">{payment.collectedByName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd className="mt-0.5 font-medium">{payment.reference || "—"}</dd>
            </div>
            {payment.notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="mt-0.5">{payment.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Allocations</h2>
        {payment.allocations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">Not allocated to any purchase — kept as supplier credit.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {payment.allocations.map((allocation) => (
              <div key={allocation.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Purchase — {DATE_FORMATTER.format(allocation.purchase.purchaseDate)}
                      {allocation.purchase.reference ? ` · ${allocation.purchase.reference}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Purchase total {formatPaise(allocation.purchase.totalInPaise)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{formatPaise(allocation.amountInPaise)}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Remaining after this payment:{" "}
                  <span className={cn("font-medium", allocation.purchaseOutstandingAfterInPaise > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                    {formatPaise(Math.max(0, allocation.purchaseOutstandingAfterInPaise))}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payment proof</h2>
        <div className="flex flex-col gap-2">
          {payment.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {payment.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <AttachmentThumb attachment={attachment} removing={removingId === attachment.id} onRemove={() => handleRemoveAttachment(attachment.id)} />
                </li>
              ))}
            </ul>
          )}
          <AddAttachmentInline paymentId={payment.id} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Recorded by</dt>
            <dd className="mt-0.5 font-medium">{payment.createdByAdminUser?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd className="mt-0.5 font-medium">{DATETIME_FORMATTER.format(payment.createdAt)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
