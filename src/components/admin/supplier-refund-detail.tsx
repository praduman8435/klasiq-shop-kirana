"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import {
  addSupplierRefundAttachmentAction,
  removeSupplierRefundAttachmentAction,
} from "@/server/actions/admin/supplier-refunds";

const REFUND_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

type Attachment = { id: string; url: string; originalFilename: string | null };
type Refund = {
  id: string;
  refundDate: Date;
  amountInPaise: number;
  refundMethod: string;
  receivedByName: string;
  reference: string | null;
  notes: string | null;
  sourceCredit: { id: string; creditNumber: string } | null;
  sourceReturn: { id: string; returnNumber: string } | null;
  createdByAdminUser: { name: string } | null;
  attachments: Attachment[];
};

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
          <img src={attachment.url} alt={attachment.originalFilename || "Refund proof"} className="size-full object-cover" onError={() => setBroken(true)} />
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

function AddAttachmentInline({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const urlId = useId();

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed || isPending) return;
    startTransition(async () => {
      const result = await addSupplierRefundAttachmentAction({ refundId, url: trimmed });
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

export function SupplierRefundDetail({ refund, supplierId }: { refund: Refund; supplierId: string }) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function handleRemoveAttachment(attachmentId: string) {
    setRemovingId(attachmentId);
    removeSupplierRefundAttachmentAction({ id: attachmentId }).then((result) => {
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
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Refund</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Amount</dt>
            <dd className="mt-0.5 text-lg font-semibold">{formatPaise(refund.amountInPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Refund date</dt>
            <dd className="mt-0.5 font-medium">{DATE_FORMATTER.format(refund.refundDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Method</dt>
            <dd className="mt-0.5 font-medium">{REFUND_METHOD_LABEL[refund.refundMethod] ?? refund.refundMethod}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Received by</dt>
            <dd className="mt-0.5 font-medium">{refund.receivedByName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Reference</dt>
            <dd className="mt-0.5 font-medium">{refund.reference || "—"}</dd>
          </div>
          {(refund.sourceCredit || refund.sourceReturn) && (
            <div>
              <dt className="text-xs text-muted-foreground">Linked to</dt>
              <dd className="mt-0.5 flex flex-col gap-0.5 font-medium">
                {refund.sourceCredit && (
                  <a href={`/admin/suppliers/${supplierId}/credits/${refund.sourceCredit.id}`} className="hover:underline">
                    Credit #{refund.sourceCredit.creditNumber}
                  </a>
                )}
                {refund.sourceReturn && <span>Return #{refund.sourceReturn.returnNumber}</span>}
              </dd>
            </div>
          )}
          {refund.notes && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs text-muted-foreground">Notes</dt>
              <dd className="mt-0.5">{refund.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Proof</h2>
        <div className="flex flex-col gap-2">
          {refund.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {refund.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <AttachmentThumb attachment={attachment} removing={removingId === attachment.id} onRemove={() => handleRemoveAttachment(attachment.id)} />
                </li>
              ))}
            </ul>
          )}
          <AddAttachmentInline refundId={refund.id} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Audit</h2>
        <p className="text-sm">
          <span className="text-muted-foreground">Recorded by </span>
          <span className="font-medium">{refund.createdByAdminUser?.name ?? "—"}</span>
        </p>
      </section>
    </div>
  );
}
