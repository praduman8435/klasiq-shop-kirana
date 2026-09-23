"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import { createSchoolAction, updateSchoolAction } from "@/server/actions/admin/schools";

type SchoolFormValues = {
  id?: string;
  name: string;
  slug: string;
  city: string;
  logoUrl: string;
  isActive: boolean;
  isVerifiedPartner: boolean;
};

export function SchoolForm({ initial }: { initial?: SchoolFormValues }) {
  const router = useRouter();
  const isEditing = Boolean(initial?.id);
  const nameId = useId();
  const slugId = useId();
  const cityId = useId();
  const logoId = useId();

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [city, setCity] = useState(initial?.city ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [isVerifiedPartner, setIsVerifiedPartner] = useState(initial?.isVerifiedPartner ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);

    startTransition(async () => {
      const payload = { name, slug, city, logoUrl, isActive, isVerifiedPartner };

      if (isEditing) {
        const result = await updateSchoolAction({ ...payload, id: initial!.id });
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        toast.success("School updated.");
        router.refresh();
        return;
      }

      const result = await createSchoolAction(payload);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success("School created.");
      router.push(`/admin/schools/${result.id}`);
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
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">School</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>School name</Label>
          <Input id={nameId} className="h-9" value={name} onChange={(e) => handleNameChange(e.target.value)} required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={cityId}>City (optional)</Label>
          <Input id={cityId} className="h-9" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Public URL</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={slugId}>Slug</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>/school/</span>
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
          {isEditing && (
            <p className="text-xs font-medium text-amber-500">
              Changing the slug breaks any printed QR codes or shared links using the old address.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Branding</h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={logoId}>Logo URL (optional)</Label>
          <Input
            id={logoId}
            className="h-9"
            type="url"
            placeholder="https://..."
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Partnership / Visibility
        </h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded border border-border"
          />
          Active (visible in search and reachable at its storefront URL)
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isVerifiedPartner}
            onChange={(e) => setIsVerifiedPartner(e.target.checked)}
            className="mt-0.5 size-4 rounded border border-border"
          />
          <span>
            Verified partner — shows &quot;Official Uniform Partner&quot; instead of the default
            &quot;School Uniform Collection&quot; wording. Only enable this for a confirmed real
            partnership.
          </span>
        </label>
      </div>

      <Button type="submit" className="h-9 w-full sm:w-auto" disabled={isPending}>
        {isPending ? "Saving…" : isEditing ? "Save changes" : "Create school"}
      </Button>
    </form>
  );
}
