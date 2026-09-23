"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createAssignmentAction, deleteAssignmentAction } from "@/server/actions/admin/schools";

type Assignment = {
  id: string;
  gender: "BOYS" | "GIRLS" | "UNISEX";
  class: { id: string; name: string } | null;
  product: { id: string; name: string };
};

const GENDER_LABEL: Record<Assignment["gender"], string> = {
  BOYS: "Boys",
  GIRLS: "Girls",
  UNISEX: "All",
};

export function SchoolAssignmentsManager({
  schoolId,
  assignments,
  classes,
  products,
}: {
  schoolId: string;
  assignments: Assignment[];
  classes: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [productId, setProductId] = useState("");
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState<Assignment["gender"]>("UNISEX");

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !productId) return;
    startTransition(async () => {
      const result = await createAssignmentAction({
        schoolId,
        classId: classId || null,
        gender,
        productId,
      });
      if (result.success) {
        toast.success("Item assigned.");
        setProductId("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string) {
    if (isPending) return;
    startTransition(async () => {
      const result = await deleteAssignmentAction({ id });
      if (result.success) {
        toast.success("Assignment removed.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div>
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No uniform items assigned yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {assignments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{a.product.name}</span>{" "}
                <span className="text-muted-foreground">
                  &middot; {a.class?.name ?? "All Classes"} &middot; {GENDER_LABEL[a.gender]}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Remove ${a.product.name} assignment`}
                disabled={isPending}
                onClick={() => handleDelete(a.id)}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          aria-label="Product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Choose a product...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Gender group"
          value={gender}
          onChange={(e) => setGender(e.target.value as Assignment["gender"])}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="UNISEX">All (unisex)</option>
          <option value="BOYS">Boys</option>
          <option value="GIRLS">Girls</option>
        </select>

        <Button type="submit" variant="outline" className="h-9" disabled={isPending || !productId}>
          Assign
        </Button>
      </form>
    </div>
  );
}
