"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductPhotoPicker } from "@/components/admin/product-photo-picker";
import { slugify } from "@/lib/slug";
import { createProductAction, updateProductAction } from "@/server/actions/admin/products";

type ProductFormValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  brand: string;
  imageUrl: string;
  isActive: boolean;
};

export function ProductForm({
  initial,
  categories,
}: {
  initial?: ProductFormValues;
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const isEditing = Boolean(initial?.id);
  const nameId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const brandId = useId();

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || photoUploading) return;
    setError(null);

    startTransition(async () => {
      const payload = {
        name,
        slug,
        description,
        categoryId,
        brand,
        imageUrl,
        isActive,
      };

      if (isEditing) {
        const result = await updateProductAction({ ...payload, id: initial!.id });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        toast.success("Product updated.");
        router.refresh();
        return;
      }

      const result = await createProductAction(payload);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("Product created — add pack sizes below.");
      router.push(`/admin/products/${result.id}`);
    });
  }

  const selectClass =
    "h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Product</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Product name</Label>
          <Input id={nameId} className="h-9" value={name} onChange={(e) => handleNameChange(e.target.value)} required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={slugId}>Slug</Label>
          <Input
            id={slugId}
            className="h-9"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={descriptionId}>Description (optional)</Label>
          <Input id={descriptionId} className="h-9" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Classification</h3>
        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={brandId}>Brand (optional)</Label>
          <Input
            id={brandId}
            className="h-9"
            placeholder="e.g. Tata, Amul, Aashirvaad"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            As printed on the pack. Leave blank for loose or unbranded goods. Customers can
            search by brand.
          </p>
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Presentation</h3>
        <div className="flex flex-col gap-1.5">
          <Label>Photo (optional)</Label>
          <ProductPhotoPicker
            value={imageUrl}
            onChange={setImageUrl}
            productName={name}
            onUploadingChange={setPhotoUploading}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded border border-border"
          />
          Active (visible on the storefront)
        </label>
      </div>

      <Button type="submit" className="h-9 w-full sm:w-auto" disabled={isPending || photoUploading}>
        {photoUploading ? "Uploading photo…" : isPending ? "Saving…" : isEditing ? "Save changes" : "Create product"}
      </Button>
    </form>
  );
}
