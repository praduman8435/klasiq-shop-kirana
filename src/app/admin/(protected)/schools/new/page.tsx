import type { Metadata } from "next";
import { SchoolForm } from "@/components/admin/school-form";

export const metadata: Metadata = { title: "Add School" };

export default function NewSchoolPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add School</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          You can configure classes, uniform items and recommended sets after creating it.
        </p>
      </div>
      <div className="max-w-xl">
        <SchoolForm />
      </div>
    </div>
  );
}
