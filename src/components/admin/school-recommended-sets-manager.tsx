"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addSetItemAction,
  createRecommendedSetAction,
  deleteRecommendedSetAction,
  removeSetItemAction,
} from "@/server/actions/admin/schools";

type Gender = "BOYS" | "GIRLS" | "UNISEX";

type SetItem = { id: string; quantity: number; product: { id: string; name: string } };
type RecommendedSet = {
  id: string;
  name: string;
  description: string | null;
  gender: Gender;
  class: { id: string; name: string } | null;
  items: SetItem[];
};

const GENDER_LABEL: Record<Gender, string> = { BOYS: "Boys", GIRLS: "Girls", UNISEX: "All" };

function SetItemsEditor({
  set,
  products,
}: {
  set: RecommendedSet;
  products: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  function handleAddItem(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !productId) return;
    const qty = Number.parseInt(quantity, 10);
    if (Number.isNaN(qty) || qty < 1) {
      toast.error("Enter a valid quantity.");
      return;
    }
    startTransition(async () => {
      const result = await addSetItemAction({ setId: set.id, productId, quantity: qty });
      if (result.success) {
        toast.success("Item added to set.");
        setProductId("");
        setQuantity("1");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRemoveItem(id: string) {
    if (isPending) return;
    startTransition(async () => {
      const result = await removeSetItemAction({ id });
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDeleteSet() {
    if (isPending) return;
    const confirmed = window.confirm(`Delete the "${set.name}" recommended set?`);
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteRecommendedSetAction({ id: set.id });
      if (result.success) {
        toast.success("Set deleted.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{set.name}</p>
          <p className="text-xs text-muted-foreground">
            {set.class?.name ?? "All Classes"} &middot; {GENDER_LABEL[set.gender]}
          </p>
          {set.description && <p className="mt-1 text-sm text-muted-foreground">{set.description}</p>}
        </div>
        <button
          type="button"
          aria-label={`Delete ${set.name}`}
          disabled={isPending}
          onClick={handleDeleteSet}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>

      {set.items.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {set.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between">
              <span>
                {item.quantity} &times; {item.product.name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${item.product.name} from set`}
                disabled={isPending}
                onClick={() => handleRemoveItem(item.id)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAddItem} className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Product to add"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Add item...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 w-16 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={isPending || !productId}>
          Add
        </Button>
      </form>
    </div>
  );
}

export function SchoolRecommendedSetsManager({
  schoolId,
  sets,
  classes,
  products,
}: {
  schoolId: string;
  sets: RecommendedSet[];
  classes: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState<Gender>("UNISEX");

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !name.trim()) return;
    startTransition(async () => {
      const result = await createRecommendedSetAction({
        schoolId,
        classId: classId || null,
        gender,
        name: name.trim(),
      });
      if (result.success) {
        toast.success("Set created — add items below.");
        setName("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {sets.map((set) => (
        <SetItemsEditor key={set.id} set={set} products={products} />
      ))}

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3.5 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <Input
          placeholder="Set name, e.g. Class 7 — Boys — Complete Uniform"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 sm:max-w-xs"
        />
        <select
          aria-label="Class for set"
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
          aria-label="Gender for set"
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="UNISEX">All (unisex)</option>
          <option value="BOYS">Boys</option>
          <option value="GIRLS">Girls</option>
        </select>
        <Button type="submit" variant="outline" className="h-9" disabled={isPending || !name.trim()}>
          New set
        </Button>
      </form>
    </div>
  );
}
