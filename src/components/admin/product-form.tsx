"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductPhotoPicker } from "@/components/admin/product-photo-picker";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
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

/** Sizes a kirana shop types all day — one tap fills the field. */
export const COMMON_PACK_SIZES = ["100 g", "200 g", "250 g", "500 g", "1 kg", "5 kg", "500 ml", "1 L", "Pack of 1"];

export const fieldClass = "h-10";
export const selectClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** An on/off switch with its label — clearer than a checkbox for "show on website". */
export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border border-border px-3.5 py-3 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-secondary")}
      >
        <span className={cn("absolute top-0.5 left-0 size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

/**
 * A product's details: photo, name, brand, category, description, and
 * whether customers can see it. Adding a product also takes its first
 * pack size (size, price, MRP, stock), so it's ready to sell in one go.
 * The web address is made from the name and tucked under More settings.
 */
export function ProductForm({
  initial,
  categories,
}: {
  initial?: ProductFormValues;
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const isEditing = Boolean(initial?.id);
  const ids = {
    name: useId(),
    brand: useId(),
    category: useId(),
    description: useId(),
    slug: useId(),
    size: useId(),
    price: useId(),
    mrp: useId(),
    stock: useId(),
  };

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [pack, setPack] = useState({ size: "", price: "", mrp: "", stock: "" });
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
    if (name.trim().length < 2) return setError("Enter the product name.");
    if (!isEditing) {
      if (!pack.size.trim()) return setError("Enter the first pack size, like 1 kg.");
      if (!(Number(pack.price) > 0)) return setError("Enter the selling price.");
      if (pack.mrp && Number(pack.mrp) < Number(pack.price)) return setError("Selling price can't be more than the MRP.");
    }

    startTransition(async () => {
      const payload = { name, slug, description, categoryId, brand, imageUrl, isActive };

      if (isEditing) {
        const result = await updateProductAction({ ...payload, id: initial!.id });
        if (!result.success) return setError(result.error.message);
        toast.success("Saved");
        router.refresh();
        return;
      }

      const result = await createProductAction({
        ...payload,
        slug: slugTouched ? slug : "",
        firstPack: {
          size: pack.size,
          priceInRupees: pack.price,
          mrpInRupees: pack.mrp ? pack.mrp : null,
          stockQuantity: pack.stock || 0,
        },
      });
      if (!result.success) return setError(result.error.message);
      toast.success(`${name.trim()} added`);
      router.push(`/admin/products/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Photo</Label>
        <ProductPhotoPicker value={imageUrl} onChange={setImageUrl} productName={name} onUploadingChange={setPhotoUploading} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.name}>Product name</Label>
        <Input
          id={ids.name}
          className={fieldClass}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Toor Dal"
          autoFocus={!isEditing}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.brand}>
            Brand <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id={ids.brand} className={fieldClass} placeholder="Tata, Amul, Aashirvaad…" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.category}>Category</Label>
          <select id={ids.category} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isEditing && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-semibold">First pack size</legend>
          <p className="-mt-1 text-xs text-muted-foreground">You can add more sizes (like 500 g and 5 kg) after saving.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.size}>Pack size</Label>
            <Input id={ids.size} className={fieldClass} placeholder="e.g. 1 kg" value={pack.size} onChange={(e) => setPack({ ...pack, size: e.target.value })} />
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PACK_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPack({ ...pack, size: s })}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs transition-colors",
                    pack.size === s ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.price}>Selling price</Label>
              <Input id={ids.price} className={fieldClass} inputMode="decimal" placeholder="₹" value={pack.price} onChange={(e) => setPack({ ...pack, price: e.target.value.replace(/[^\d.]/g, "") })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.mrp}>
                MRP <span className="font-normal text-muted-foreground">(opt.)</span>
              </Label>
              <Input id={ids.mrp} className={fieldClass} inputMode="decimal" placeholder="₹" value={pack.mrp} onChange={(e) => setPack({ ...pack, mrp: e.target.value.replace(/[^\d.]/g, "") })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.stock}>In stock</Label>
              <Input id={ids.stock} className={fieldClass} inputMode="numeric" placeholder="0" value={pack.stock} onChange={(e) => setPack({ ...pack, stock: e.target.value.replace(/\D/g, "") })} />
            </div>
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.description}>
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id={ids.description}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A line customers see on the product page"
          className="min-h-16 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Switch
        checked={isActive}
        onChange={setIsActive}
        label="Show on website"
        hint={isActive ? "Customers can find and order it." : "Hidden from customers. You can still sell it at the counter."}
      />

      <details className="group rounded-lg border border-border">
        <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3.5 text-sm text-muted-foreground hover:text-foreground">
          More settings
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col gap-1.5 border-t border-border p-3.5">
          <Label htmlFor={ids.slug}>Web address</Label>
          <div className="flex items-center overflow-hidden rounded-lg border border-border focus-within:ring-2 focus-within:ring-ring">
            <span className="shrink-0 bg-secondary px-2.5 py-2.5 text-xs text-muted-foreground">/product/</span>
            <input
              id={ids.slug}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              placeholder="made from the name"
              className="h-10 min-w-0 flex-1 bg-background px-2.5 text-sm outline-none"
            />
          </div>
          <p className="text-xs text-muted-foreground">Made from the name automatically. Change it only if you need a different link.</p>
        </div>
      </details>

      <Button type="submit" className="h-11 w-full text-base sm:w-auto sm:min-w-40" disabled={isPending || photoUploading}>
        {photoUploading ? "Uploading photo…" : isPending ? "Saving…" : isEditing ? "Save changes" : "Add product"}
      </Button>
    </form>
  );
}
