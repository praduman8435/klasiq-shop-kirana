"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/slug";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/server/actions/admin/categories";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  displayInHeader: boolean;
  headerOrder: number;
  _count: { products: number };
};

/**
 * Phase 3.6.7 Part 1, section 3 — shared by both the create form and the
 * edit form below, so "Display in Header"/"Header Order" behave
 * identically in both places rather than two near-duplicate controls.
 */
function HeaderVisibilityFields({
  displayInHeader,
  onDisplayInHeaderChange,
  headerOrder,
  onHeaderOrderChange,
  idPrefix,
}: {
  displayInHeader: boolean;
  onDisplayInHeaderChange: (value: boolean) => void;
  headerOrder: number;
  onHeaderOrderChange: (value: number) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={`${idPrefix}-display-in-header`} className="flex items-center gap-1.5 text-xs font-medium">
        <input
          id={`${idPrefix}-display-in-header`}
          type="checkbox"
          checked={displayInHeader}
          onChange={(e) => onDisplayInHeaderChange(e.target.checked)}
          className="size-3.5"
        />
        Display in header
      </label>
      <label htmlFor={`${idPrefix}-header-order`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Order
        <Input
          id={`${idPrefix}-header-order`}
          type="number"
          min={0}
          value={headerOrder}
          onChange={(e) => onHeaderOrderChange(Number(e.target.value) || 0)}
          className="h-8 w-16 text-xs"
        />
      </label>
    </div>
  );
}

function CategoryEditForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [description, setDescription] = useState(category.description ?? "");
  const [displayInHeader, setDisplayInHeader] = useState(category.displayInHeader);
  const [headerOrder, setHeaderOrder] = useState(category.headerOrder);

  function handleSave() {
    if (isPending) return;
    startTransition(async () => {
      const result = await updateCategoryAction({
        id: category.id,
        name,
        slug,
        description,
        displayInHeader,
        headerOrder,
      });
      if (result.success) {
        toast.success("Category updated.");
        onDone();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-secondary/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-8 w-40 text-xs" />
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Slug" className="h-8 w-40 text-xs" />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="h-8 w-48 text-xs"
        />
      </div>
      {/* Section 5 — renaming (the Name field above) never touches Slug;
          this is a plain, independent input, not derived from Name, so
          nothing here can silently change a category's URL. */}
      <p className="text-[11px] text-muted-foreground">
        Changing the slug changes this category&apos;s storefront URL — leave it as-is when only renaming.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <HeaderVisibilityFields
          displayInHeader={displayInHeader}
          onDisplayInHeaderChange={setDisplayInHeader}
          headerOrder={headerOrder}
          onHeaderOrderChange={setHeaderOrder}
          idPrefix={`edit-${category.id}`}
        />
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  function handleDelete() {
    if (isPending) return;
    if (category._count.products > 0) {
      toast.error(
        `This category has ${category._count.products} product${category._count.products === 1 ? "" : "s"} — move or remove them first.`,
      );
      return;
    }
    const confirmed = window.confirm(`Delete the "${category.name}" category?`);
    if (!confirmed) return;
    startTransition(async () => {
      const result = await deleteCategoryAction({ id: category.id });
      if (result.success) {
        toast.success("Category deleted.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  if (editing) {
    return (
      <li className="py-2">
        <CategoryEditForm category={category} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3 text-sm">
      <div>
        <p className="font-medium">{category.name}</p>
        <p className="text-xs text-muted-foreground">
          /{category.slug} &middot; {category._count.products} product
          {category._count.products === 1 ? "" : "s"}
          {category.description ? ` · ${category.description}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {category.displayInHeader ? `In header · position ${category.headerOrder}` : "Hidden from header"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Edit ${category.name}`}
          disabled={isPending}
          onClick={() => setEditing(true)}
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Delete ${category.name}`}
          disabled={isPending}
          onClick={handleDelete}
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [displayInHeader, setDisplayInHeader] = useState(false);
  const [headerOrder, setHeaderOrder] = useState(0);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function resetForm() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setDisplayInHeader(false);
    setHeaderOrder(0);
  }

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !name.trim() || !slug.trim()) return;
    startTransition(async () => {
      const result = await createCategoryAction({
        name: name.trim(),
        slug: slug.trim(),
        displayInHeader,
        headerOrder,
      });
      if (result.success) {
        toast.success("Category created.");
        resetForm();
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y rounded-2xl border bg-card px-4">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </ul>

      <form
        onSubmit={handleAdd}
        className="flex flex-col gap-3 rounded-xl border border-dashed p-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Category name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="sm:max-w-xs"
          />
          <Input
            placeholder="Slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            className="sm:max-w-xs"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <HeaderVisibilityFields
            displayInHeader={displayInHeader}
            onDisplayInHeaderChange={setDisplayInHeader}
            headerOrder={headerOrder}
            onHeaderOrderChange={setHeaderOrder}
            idPrefix="new-category"
          />
          <Button type="submit" variant="outline" disabled={isPending || !name.trim() || !slug.trim()}>
            Add category
          </Button>
        </div>
      </form>
    </div>
  );
}
