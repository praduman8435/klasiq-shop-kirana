"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupplierAction, updateSupplierAction } from "@/server/actions/admin/suppliers";

type SupplierFormValues = {
  id?: string;
  name: string;
  businessName: string;
  phone: string;
  addressLine: string;
  city: string;
  gstNumber: string;
  notes: string;
  isActive: boolean;
};

/**
 * Grouped into SUPPLIER / CONTACT / BUSINESS sections with hairline
 * dividers, matching `ProductForm`/`SchoolForm`'s own established
 * pattern (src/components/admin/product-form.tsx, school-form.tsx) —
 * same compact `h-9` controls, same uppercase micro-label section
 * headings, same single combined create/edit component.
 */
export function SupplierForm({ initial }: { initial?: SupplierFormValues }) {
  const router = useRouter();
  const isEditing = Boolean(initial?.id);
  const nameId = useId();
  const businessNameId = useId();
  const phoneId = useId();
  const addressLineId = useId();
  const cityId = useId();
  const gstId = useId();
  const notesId = useId();

  const [name, setName] = useState(initial?.name ?? "");
  const [businessName, setBusinessName] = useState(initial?.businessName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [gstNumber, setGstNumber] = useState(initial?.gstNumber ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      const payload = { name, businessName, phone, addressLine, city, gstNumber, notes, isActive };

      if (isEditing) {
        const result = await updateSupplierAction({ ...payload, id: initial!.id });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        toast.success("Supplier updated.");
        router.refresh();
        return;
      }

      const result = await createSupplierAction(payload);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Supplier created.");
      router.push(`/admin/suppliers/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Supplier</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input id={nameId} className="h-9" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={businessNameId}>Business / shop name (optional)</Label>
          <Input
            id={businessNameId}
            className="h-9"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Leave blank if same as name"
          />
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contact</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={phoneId}>Mobile (optional)</Label>
          <Input id={phoneId} className="h-9" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={addressLineId}>Address (optional)</Label>
          <Input id={addressLineId} className="h-9" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={cityId}>City (optional)</Label>
          <Input id={cityId} className="h-9" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Business</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={gstId}>GST number (optional)</Label>
          <Input id={gstId} className="h-9" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notesId}>Notes (optional)</Label>
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            className="rounded-md border border-input bg-background p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded border border-border"
          />
          Active
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" className="h-9" disabled={isPending}>
          {isPending ? "Saving…" : isEditing ? "Save changes" : "Create Supplier"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={isPending}
          onClick={() => router.push(isEditing ? `/admin/suppliers/${initial!.id}` : "/admin/suppliers")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
