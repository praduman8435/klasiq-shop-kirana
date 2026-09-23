"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import { createSupplierPurchaseAction } from "@/server/actions/admin/supplier-purchases";

type DraftAttachment = { key: number; url: string; originalFilename: string };
type DraftBill = {
  key: number;
  billNumber: string;
  billDate: string;
  amount: string;
  notes: string;
  attachments: DraftAttachment[];
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Section 4 (Part 2 brief) — bill/attachment images are a plain,
 * admin-pasted URL, not a real upload. This codebase has NO binary
 * file-upload/storage infrastructure anywhere yet (see
 * SupplierPurchaseBillAttachment's own schema doc comment); this matches
 * Product.imageUrl/School.logoUrl's identical existing "paste a link to
 * an already-hosted image" convention rather than inventing a fake
 * backend upload pipeline or storing base64 blobs in Postgres.
 */
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
        Attachments
      </Label>
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.key} className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border bg-secondary/20">
              {/* eslint-disable-next-line @next/next/no-img-element -- pasted external URL, not an optimizable local/known-domain asset */}
              <img
                src={attachment.url}
                alt={attachment.originalFilename || "Bill attachment"}
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
          placeholder="Paste a link to an already-hosted bill image"
          className="h-8 flex-1 text-sm"
        />
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAdd} disabled={!url.trim()}>
          <Plus className="size-3.5" aria-hidden />
          Add bill image
        </Button>
      </div>
    </div>
  );
}

function BillCard({
  bill,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  bill: DraftBill;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<DraftBill>) => void;
  onRemove: () => void;
}) {
  const numberId = useId();
  const dateId = useId();
  const amountId = useId();
  const notesId = useId();

  function addAttachment(url: string, filename: string) {
    onChange({ attachments: [...bill.attachments, { key: Date.now() + Math.random(), url, originalFilename: filename }] });
  }
  function removeAttachment(key: number) {
    onChange({ attachments: bill.attachments.filter((a) => a.key !== key) });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/10 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Bill {index + 1}</h4>
        {canRemove && (
          <button
            type="button"
            aria-label={`Remove bill ${index + 1}`}
            onClick={onRemove}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor={numberId}>Bill number (optional)</Label>
          <Input id={numberId} className="h-9" value={bill.billNumber} onChange={(e) => onChange({ billNumber: e.target.value })} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor={dateId}>Bill date</Label>
          <Input id={dateId} type="date" className="h-9" value={bill.billDate} onChange={(e) => onChange({ billDate: e.target.value })} required />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1.5">
          <Label htmlFor={amountId}>Amount (₹)</Label>
          <Input
            id={amountId}
            type="number"
            step="0.01"
            min={0}
            className="h-9"
            value={bill.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notesId}>Notes (optional)</Label>
        <Input id={notesId} className="h-9" value={bill.notes} onChange={(e) => onChange({ notes: e.target.value })} />
      </div>

      <AttachmentEditor attachments={bill.attachments} onAdd={addAttachment} onRemove={removeAttachment} />
    </div>
  );
}

export function NewSupplierPurchaseForm({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [purchaseDate, setPurchaseDate] = useState(todayIsoDate());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const billKeyRef = useRef(1);
  const [bills, setBills] = useState<DraftBill[]>(() => [
    { key: 0, billNumber: "", billDate: todayIsoDate(), amount: "", notes: "", attachments: [] },
  ]);

  function addBill() {
    setBills((prev) => [
      ...prev,
      { key: billKeyRef.current++, billNumber: "", billDate: purchaseDate, amount: "", notes: "", attachments: [] },
    ]);
  }
  function removeBill(key: number) {
    setBills((prev) => prev.filter((b) => b.key !== key));
  }
  function updateBill(key: number, patch: Partial<DraftBill>) {
    setBills((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  const totalRupees = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const canSubmit = bills.length > 0 && bills.every((b) => b.billDate && Number(b.amount) > 0);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !canSubmit) return;
    setError(null);

    startTransition(async () => {
      const result = await createSupplierPurchaseAction({
        supplierId,
        purchaseDate,
        reference: reference || undefined,
        notes: notes || undefined,
        bills: bills.map((b) => ({
          billNumber: b.billNumber || undefined,
          billDate: b.billDate,
          amountInRupees: Number(b.amount),
          notes: b.notes || undefined,
          attachments: b.attachments.map((a) => ({ url: a.url, originalFilename: a.originalFilename || undefined })),
        })),
      });

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Purchase recorded.");
      router.push(`/admin/suppliers/${supplierId}/purchases/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Supplier</Label>
        <p className="text-sm font-medium">{supplierName}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="purchase-date">Purchase date</Label>
          <Input id="purchase-date" type="date" className="h-9" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor="purchase-reference">Reference (optional)</Label>
          <Input id="purchase-reference" className="h-9" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. delivery challan #" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="purchase-notes">Notes (optional)</Label>
        <Input id="purchase-notes" className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bills</h3>
          <p className="text-xs text-muted-foreground">One purchase can contain multiple bills.</p>
        </div>

        {bills.map((bill, index) => (
          <BillCard
            key={bill.key}
            bill={bill}
            index={index}
            canRemove={bills.length > 1}
            onChange={(patch) => updateBill(bill.key, patch)}
            onRemove={() => removeBill(bill.key)}
          />
        ))}

        <Button type="button" variant="outline" className="h-9 w-fit" onClick={addBill}>
          <Plus className="size-4" aria-hidden />
          Add another bill
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-4 py-3">
        <span className="text-sm font-medium text-muted-foreground">Purchase total</span>
        <span className="text-lg font-semibold">{formatPaise(Math.round(totalRupees * 100))}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" className="h-9" disabled={isPending || !canSubmit}>
          {isPending ? "Saving…" : "Save Purchase"}
        </Button>
        <Button type="button" variant="ghost" className="h-9" disabled={isPending} onClick={() => router.push(`/admin/suppliers/${supplierId}`)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
