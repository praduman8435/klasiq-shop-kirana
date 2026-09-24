"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/admin/supplier-quick-controls";
import { quickCreateSupplierAction } from "@/server/actions/admin/supplier-quick";

/**
 * Add supplier: name and phone are all it takes. "Already owe" lets the
 * shop start with the dues it has today (purana baaki); the rest of the
 * details are tucked away until needed.
 */
export function SupplierQuickCreateForm() {
  const router = useRouter();
  const ids = {
    name: useId(),
    phone: useId(),
    opening: useId(),
    business: useId(),
    city: useId(),
    address: useId(),
    gst: useId(),
    notes: useId(),
  };
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [opening, setOpening] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await quickCreateSupplierAction({
        name,
        phone,
        businessName,
        city,
        addressLine,
        gstNumber,
        notes,
        openingBalanceInRupees: opening ? Number(opening) : undefined,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      toast.success(`${name.trim()} added.`);
      router.push(`/admin/suppliers/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.name}>Supplier name</Label>
        <Input
          id={ids.name}
          className="h-11"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ramesh Traders"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.phone}>Mobile number (optional)</Label>
        <Input
          id={ids.phone}
          className="h-11"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
        />
        <p className="text-xs text-muted-foreground">For the Call and WhatsApp buttons.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.opening}>Already owe them? (optional)</Label>
        <AmountInput id={ids.opening} value={opening} onChange={setOpening} />
        <p className="text-xs text-muted-foreground">
          Purana baaki: what you owe this supplier today, before using Klasiq. Leave empty if nothing.
        </p>
      </div>

      {showMore ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.business}>Business / shop name</Label>
            <Input id={ids.business} className="h-11" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="If different from the name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.city}>City / market</Label>
              <Input id={ids.city} className="h-11" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.gst}>GST no.</Label>
              <Input id={ids.gst} className="h-11" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.address}>Address</Label>
            <Input id={ids.address} className="h-11" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.notes}>Notes</Label>
            <Input id={ids.notes} className="h-11" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Delivers on Tuesdays" />
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="-mt-2 h-9 w-fit text-sm text-muted-foreground hover:text-foreground">
          + Add business name, city, address, GST
        </button>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="h-12 text-base" disabled={isPending}>
        {isPending ? "Adding…" : "Add supplier"}
      </Button>
    </form>
  );
}
