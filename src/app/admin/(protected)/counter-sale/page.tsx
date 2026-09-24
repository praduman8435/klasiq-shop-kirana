import type { Metadata } from "next";
import { CounterSaleForm } from "@/components/admin/counter-sale-form";

export const metadata: Metadata = { title: "Counter Sale" };

export default function CounterSalePage() {
  return (
    // AdminShell establishes the dark scope + background for the whole
    // admin application; this page just renders directly into it.
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Counter Sale</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Bill a walk-in customer</p>
      </div>
      <CounterSaleForm />
    </div>
  );
}
