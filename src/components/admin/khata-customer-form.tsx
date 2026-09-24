"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/admin/supplier-quick-controls";
import { createKhataCustomerAction } from "@/server/actions/admin/khata-quick";

/** Add a customer to KhataBook, with what they already owe from the paper khata. */
export function KhataCustomerForm() {
  const router = useRouter();
  const ids = { name: useId(), phone: useId(), opening: useId() };
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await createKhataCustomerAction({
        name,
        phone,
        openingBalanceInRupees: opening ? Number(opening) : undefined,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (result.existed) {
        toast.info("This number is already in KhataBook. Opening their khata.");
      } else {
        toast.success(`${name.trim()} added to KhataBook.`);
      }
      router.push(`/admin/khatabook/${result.customerId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.name}>Customer name</Label>
        <Input id={ids.name} className="h-11" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunita Devi" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.phone}>Mobile number</Label>
        <Input id={ids.phone} className="h-11" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
        <p className="text-xs text-muted-foreground">Used for reminders on WhatsApp, and to match their counter bills.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.opening}>Purana udhaar (optional)</Label>
        <AmountInput id={ids.opening} value={opening} onChange={setOpening} />
        <p className="text-xs text-muted-foreground">What they already owe from your paper khata. Leave empty if nothing.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="h-12 text-base" disabled={isPending}>
        {isPending ? "Adding…" : "Add customer"}
      </Button>
    </form>
  );
}
