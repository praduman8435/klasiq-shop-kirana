import type { Metadata } from "next";
import { CounterSaleForm } from "@/components/admin/counter-sale-form";
import { getAllSchoolsForPicker } from "@/server/queries/admin/products";

export const metadata: Metadata = { title: "Counter Sale" };

export default async function CounterSalePage() {
  const schools = await getAllSchoolsForPicker();

  return (
    // AdminShell establishes the dark scope + background for the whole
    // admin application; this page just renders directly into it.
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Counter Sale</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Record a walk-in sale</p>
      </div>
      <CounterSaleForm schools={schools} />
    </div>
  );
}
