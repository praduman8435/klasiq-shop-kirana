"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import { createSupplierRefundAction } from "@/server/actions/admin/supplier-refunds";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const REFUND_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OTHER", label: "Other" },
] as const;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

type DraftAttachment = { key: number; url: string; originalFilename: string };
type CreditOption = { id: string; creditNumber: string; unallocatedInPaise: number };

function AttachmentEditor({
  attachments,
  onAdd,
  onRemove,
}: {
  attachments: DraftAttachment[];
  onAdd: (url: string, filename: string) => void;
  onRemove: (key: number) => void;
}) {
  const [url, setUrl] = useState("");
  const urlId = useId();

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    let filename = "";
    try {
      filename = decodeURIComponent(new URL(trimmed).pathname.split("/").pop() ?? "");
    } catch {
      // Not a parseable URL yet — validation on submit will catch it.
    }
    onAdd(trimmed, filename);
    setUrl("");
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={urlId} className="text-xs text-muted-foreground">
        Proof
      </Label>
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.key} className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary/20">
              {/* eslint-disable-next-line @next/next/no-img-element -- pasted external URL, not an optimizable local/known-domain asset */}
              <img
                src={attachment.url}
                alt={attachment.originalFilename || "Refund proof"}
                className="size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <button
                type="button"
                aria-label={`Remove attachment ${attachment.originalFilename || attachment.url}`}
                onClick={() => onRemove(attachment.key)}
                className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          id={urlId}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link to an already-hosted proof image"
          className="h-8 flex-1 text-sm"
        />
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAdd} disabled={!url.trim()}>
          <Plus className="size-3.5" aria-hidden />
          Add image
        </Button>
      </div>
    </div>
  );
}

export function NewSupplierRefundForm({
  supplierId,
  supplierName,
  creditOptions,
}: {
  supplierId: string;
  supplierName: string;
  creditOptions: CreditOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refundDate, setRefundDate] = useState(todayIsoDate());
  const [amount, setAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<(typeof REFUND_METHOD_OPTIONS)[number]["value"]>("CASH");
  const [receivedByName, setReceivedByName] = useState("");
  const [sourceCreditId, setSourceCreditId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedCredit = creditOptions.find((c) => c.id === sourceCreditId);
  const amountInPaise = Math.round((Number(amount) || 0) * 100);
  const exceedsCredit = selectedCredit ? amountInPaise > selectedCredit.unallocatedInPaise : false;

  const canSubmit = amountInPaise > 0 && receivedByName.trim().length > 0 && !exceedsCredit;

  function addAttachment(url: string, filename: string) {
    setAttachments((prev) => [...prev, { key: Date.now() + Math.random(), url, originalFilename: filename }]);
  }
  function removeAttachment(key: number) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await createSupplierRefundAction({
        supplierId,
        refundDate,
        amountInRupees: Number(amount),
        refundMethod,
        receivedByName,
        sourceCreditId: sourceCreditId || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        attachments: attachments.map((a) => ({ url: a.url, originalFilename: a.originalFilename || undefined })),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Supplier refund recorded.");
      router.push(`/admin/suppliers/${supplierId}/refunds/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <p className="text-xs text-muted-foreground">Supplier</p>
        <p className="text-sm font-medium">{supplierName}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="refund-date">Refund date</Label>
          <Input id="refund-date" type="date" className="h-9" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="refund-amount">Amount (₹)</Label>
          <Input id="refund-amount" type="number" step="0.01" min={0} className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor="refund-method">Refund method</Label>
          <select id="refund-method" className={SELECT_CLASS} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)}>
            {REFUND_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="received-by">Received by</Label>
          <Input
            id="received-by"
            className="h-9"
            value={receivedByName}
            onChange={(e) => setReceivedByName(e.target.value)}
            placeholder="Who from the supplier's side sent this back?"
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="refund-reference">Reference (optional)</Label>
          <Input id="refund-reference" className="h-9" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      {creditOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="refund-source-credit">Linked supplier credit (optional)</Label>
          <select id="refund-source-credit" className={SELECT_CLASS} value={sourceCreditId} onChange={(e) => setSourceCreditId(e.target.value)}>
            <option value="">None</option>
            {creditOptions.map((option) => (
              <option key={option.id} value={option.id}>
                #{option.creditNumber} · {formatPaise(option.unallocatedInPaise)} unallocated
              </option>
            ))}
          </select>
          {selectedCredit && (
            <p className={exceedsCredit ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              Unallocated on this credit: {formatPaise(selectedCredit.unallocatedInPaise)}
              {exceedsCredit && " — this refund exceeds it."}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="refund-notes">Notes (optional)</Label>
        <Input id="refund-notes" className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <AttachmentEditor attachments={attachments} onAdd={addAttachment} onRemove={removeAttachment} />

      <div className="flex items-center gap-2">
        {/* Financial-secondary treatment (sky), distinct from Credit's
            neutral/secondary button and every other supplier action. */}
        <Button
          type="submit"
          className="h-9 bg-sky-600 text-white hover:bg-sky-600/90 dark:bg-sky-600 dark:hover:bg-sky-600/90"
          disabled={isPending || !canSubmit}
        >
          <Wallet className="size-4" aria-hidden />
          {isPending ? "Saving…" : "Record Refund"}
        </Button>
        <Button type="button" variant="ghost" className="h-9" disabled={isPending} onClick={() => router.push(`/admin/suppliers/${supplierId}`)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
