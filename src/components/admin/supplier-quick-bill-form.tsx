"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AmountInput,
  ChoiceChips,
  PAYMENT_METHOD_OPTIONS,
  todayInputValue,
  type QuickPaymentMethod,
} from "@/components/admin/supplier-quick-controls";
import { formatPaise } from "@/lib/money";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { describeSupplierBalance } from "@/lib/supplier-balance";
import { quickRecordBillAction, uploadBillPhotoAction } from "@/server/actions/admin/supplier-quick";

const MAX_PHOTOS = 3;
type Paid = "NONE" | "FULL" | "PART";

/**
 * "New bill · Maal aaya": the bill amount, a photo of the paper bill, and
 * whether anything was paid on the spot — saved in one go.
 */
export function SupplierQuickBillForm({
  supplierId,
  supplierName,
  currentBalanceInPaise,
}: {
  supplierId: string;
  supplierName: string;
  currentBalanceInPaise: number;
}) {
  const router = useRouter();
  const ids = { amount: useId(), date: useId(), billNumber: useId(), paidAmount: useId(), note: useId() };
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(todayInputValue);
  const [billNumber, setBillNumber] = useState("");
  const [paid, setPaid] = useState<Paid>("NONE");
  const [paidAmount, setPaidAmount] = useState("");
  const [method, setMethod] = useState<QuickPaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountInPaise = Math.round((Number(amount) || 0) * 100);
  const paidInPaise = paid === "FULL" ? amountInPaise : paid === "PART" ? Math.round((Number(paidAmount) || 0) * 100) : 0;
  const after = describeSupplierBalance(currentBalanceInPaise + amountInPaise - paidInPaise);

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      let blob: Blob;
      try {
        blob = await shrinkPhoto(file, { maxSide: 1600, square: false });
      } catch {
        setError("Couldn't read that photo. Please try another one.");
        return;
      }
      const formData = new FormData();
      formData.append("photo", blob, blob.type === "image/webp" ? "bill.webp" : "bill.jpg");
      const result = await uploadBillPhotoAction(formData);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setPhotoIds((current) => [...current, result.id]);
    } catch {
      setError("Photo upload failed. Check your internet and try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || uploading) return;
    setError(null);
    if (amountInPaise <= 0) {
      setError("Enter the bill amount.");
      return;
    }
    startTransition(async () => {
      const result = await quickRecordBillAction({
        supplierId,
        amountInRupees: Number(amount),
        billDate,
        billNumber,
        note,
        photoIds,
        paid,
        paidAmountInRupees: paid === "PART" ? Number(paidAmount) : undefined,
        paymentMethod: method,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success(`Bill of ${formatPaise(amountInPaise)} saved for ${supplierName}.`);
      router.push(`/admin/suppliers/${supplierId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.amount}>Bill amount</Label>
        <AmountInput id={ids.amount} value={amount} onChange={setAmount} autoFocus invalid={Boolean(error) && amountInPaise <= 0} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Photo of the bill (optional)</span>
        <div className="flex flex-wrap items-center gap-2">
          {photoIds.map((id, index) => (
            <div key={id} className="relative size-20 overflow-hidden rounded-lg border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- private admin-only photo route */}
              <img src={`/admin/bill-photos/${id}`} alt={`Bill photo ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotoIds((current) => current.filter((p) => p !== id))}
                aria-label={`Remove bill photo ${index + 1}`}
                className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex size-20 items-center justify-center rounded-lg border border-border bg-muted">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Uploading photo" />
            </div>
          )}
          {photoIds.length < MAX_PHOTOS && (
            <>
              <Button type="button" variant="outline" className="h-11" disabled={uploading} onClick={() => cameraInput.current?.click()}>
                <Camera className="size-4" aria-hidden />
                Take photo
              </Button>
              <Button type="button" variant="outline" className="h-11" disabled={uploading} onClick={() => galleryInput.current?.click()}>
                <ImageIcon className="size-4" aria-hidden />
                Gallery
              </Button>
            </>
          )}
        </div>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} aria-hidden tabIndex={-1} />
        <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={handlePhoto} aria-hidden tabIndex={-1} />
      </div>

      <ChoiceChips
        label="Paid anything now?"
        columns={3}
        value={paid}
        onChange={setPaid}
        options={[
          { value: "NONE", label: "Not paid", hint: "Udhaar" },
          { value: "FULL", label: "Paid full", hint: "Pura diya" },
          { value: "PART", label: "Paid part", hint: "Thoda diya" },
        ]}
      />

      {paid === "PART" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.paidAmount}>How much did you pay?</Label>
          <AmountInput id={ids.paidAmount} value={paidAmount} onChange={setPaidAmount} />
        </div>
      )}

      {paid !== "NONE" && (
        <ChoiceChips label="Paid by" value={method} onChange={setMethod} options={PAYMENT_METHOD_OPTIONS} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.date}>Bill date</Label>
          <Input id={ids.date} type="date" className="h-11" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.billNumber}>Bill no. (optional)</Label>
          <Input id={ids.billNumber} className="h-11" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
        </div>
      </div>

      {showNote ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.note}>Note</Label>
          <Input id={ids.note} className="h-11" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 10 bags atta, 5 tins oil" />
        </div>
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="-mt-2 h-9 w-fit text-sm text-muted-foreground hover:text-foreground">
          + Add a note
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {amountInPaise > 0 && (
          <p className="text-sm text-muted-foreground">
            After this bill:{" "}
            <span className="font-medium text-foreground">
              {after.tone === "settled" ? "all settled" : `${after.label} (${after.hint})`}
            </span>
          </p>
        )}
        <Button type="submit" className="h-12 text-base" disabled={isPending || uploading}>
          {isPending ? "Saving…" : uploading ? "Uploading photo…" : "Save bill"}
        </Button>
      </div>
    </form>
  );
}
