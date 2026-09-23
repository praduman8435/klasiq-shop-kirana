"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BANNER_ICON_COMPONENTS,
  PromoBannerCard,
  type PromoBannerIcon,
  type PromoBannerTone,
} from "@/components/home/promo-banner-card";
import {
  BANNER_BODY_MAX,
  BANNER_CTA_LABEL_MAX,
  BANNER_ICONS,
  BANNER_TITLE_MAX,
  BANNER_TONES,
} from "@/lib/validation/admin-banners";
import { cn } from "@/lib/utils";
import { createBannerAction, updateBannerAction } from "@/server/actions/admin/banners";

export type BannerFormValues = {
  id?: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  tone: PromoBannerTone;
  icon: PromoBannerIcon;
  isActive: boolean;
  startsOn: string;
  endsOn: string;
};

const TONE_LABEL: Record<PromoBannerTone, string> = { RED: "Red", INK: "Black", SOFT: "Light" };
const TONE_SWATCH: Record<PromoBannerTone, string> = {
  RED: "bg-[oklch(0.54_0.21_27)]",
  INK: "bg-[oklch(0.2_0.006_270)]",
  SOFT: "bg-[oklch(0.96_0.028_25)]",
};
const ICON_LABEL: Record<PromoBannerIcon, string> = {
  DELIVERY: "Delivery",
  PICKUP: "Store",
  PAYMENT: "Payment",
  OFFER: "Offer",
  FESTIVAL: "Festival",
  FRESH: "Fresh",
};

const selectClass =
  "h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <span className={cn("text-xs tabular-nums", value.length > max ? "text-destructive" : "text-muted-foreground")}>
      {value.length}/{max}
    </span>
  );
}

/**
 * Create/edit form for a homepage banner, with a live preview rendered by
 * the storefront's own `PromoBannerCard` inside a `.store-theme` scope —
 * so the preview uses the storefront's colours and font, not admin's.
 */
export function BannerForm({
  initial,
  aisles,
}: {
  initial?: BannerFormValues;
  /** Storefront category pages, offered as one-tap link targets. */
  aisles: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const isEditing = Boolean(initial?.id);
  const [values, setValues] = useState<BannerFormValues>(
    initial ?? {
      title: "",
      body: "",
      ctaLabel: "",
      ctaHref: "",
      tone: "RED",
      icon: "OFFER",
      isActive: true,
      startsOn: "",
      endsOn: "",
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ids = {
    title: useId(),
    body: useId(),
    ctaLabel: useId(),
    ctaHref: useId(),
    startsOn: useId(),
    endsOn: useId(),
    active: useId(),
  };

  function set<K extends keyof BannerFormValues>(key: K, value: BannerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateBannerAction({ ...values, id: initial!.id })
        : await createBannerAction(values);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      toast.success(isEditing ? "Banner updated." : "Banner created.");
      router.push("/admin/banners");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={ids.title}>Title</Label>
            <CharCount value={values.title} max={BANNER_TITLE_MAX} />
          </div>
          <Input
            id={ids.title}
            className="h-9"
            placeholder="e.g. Diwali sweets are here"
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={ids.body}>Text (optional)</Label>
            <CharCount value={values.body} max={BANNER_BODY_MAX} />
          </div>
          <textarea
            id={ids.body}
            rows={2}
            placeholder="One short line under the title"
            value={values.body}
            onChange={(e) => set("body", e.target.value)}
            className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {BANNER_TONES.map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => set("tone", tone)}
                aria-pressed={values.tone === tone}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
                  values.tone === tone ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/60",
                )}
              >
                <span className={cn("size-4 rounded-full ring-1 ring-white/20", TONE_SWATCH[tone])} aria-hidden />
                {TONE_LABEL[tone]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Picture</legend>
          <div className="flex flex-wrap gap-2">
            {BANNER_ICONS.map((icon) => {
              const Icon = BANNER_ICON_COMPONENTS[icon];
              return (
                <button
                  key={icon}
                  type="button"
                  onClick={() => set("icon", icon)}
                  aria-pressed={values.icon === icon}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
                    values.icon === icon ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/60",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {ICON_LABEL[icon]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={ids.ctaLabel}>Button text (optional)</Label>
              <CharCount value={values.ctaLabel} max={BANNER_CTA_LABEL_MAX} />
            </div>
            <Input
              id={ids.ctaLabel}
              className="h-9"
              placeholder="e.g. Shop now"
              value={values.ctaLabel}
              onChange={(e) => set("ctaLabel", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.ctaHref}>Button opens</Label>
            <select
              id={ids.ctaHref}
              value={aisles.some((a) => `/${a.slug}` === values.ctaHref) || values.ctaHref === "" ? values.ctaHref : "custom"}
              onChange={(e) => set("ctaHref", e.target.value === "custom" ? "/" : e.target.value)}
              className={selectClass}
            >
              <option value="">No button</option>
              {aisles.map((aisle) => (
                <option key={aisle.slug} value={`/${aisle.slug}`}>
                  {aisle.name}
                </option>
              ))}
              <option value="custom">Another page…</option>
            </select>
            {values.ctaHref !== "" && !aisles.some((a) => `/${a.slug}` === values.ctaHref) && (
              <Input
                aria-label="Page link"
                className="h-9"
                placeholder="/search?q=atta"
                value={values.ctaHref}
                onChange={(e) => set("ctaHref", e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.startsOn}>Show from (optional)</Label>
            <Input
              id={ids.startsOn}
              type="date"
              className="h-9"
              value={values.startsOn}
              onChange={(e) => set("startsOn", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.endsOn}>Show until (optional)</Label>
            <Input
              id={ids.endsOn}
              type="date"
              className="h-9"
              value={values.endsOn}
              onChange={(e) => set("endsOn", e.target.value)}
            />
          </div>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          Leave both empty to show the banner until you hide it. Dates are in India time; &ldquo;until&rdquo; includes that
          whole day.
        </p>

        <label htmlFor={ids.active} className="flex items-center gap-2 text-sm font-medium">
          <input
            id={ids.active}
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            className="size-4"
          />
          Show on the homepage
        </label>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" className="h-9" disabled={isPending}>
            {isPending ? "Saving…" : isEditing ? "Save changes" : "Create banner"}
          </Button>
          <Button type="button" variant="outline" className="h-9" onClick={() => router.push("/admin/banners")}>
            Cancel
          </Button>
        </div>
      </form>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-medium">Preview</p>
        <div className="store-theme rounded-2xl bg-background p-4">
          <PromoBannerCard
            preview
            banner={{
              id: "preview",
              title: values.title || "Your banner title",
              body: values.body || null,
              ctaLabel: values.ctaLabel || null,
              ctaHref: values.ctaHref || null,
              tone: values.tone,
              icon: values.icon,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">This is how it looks on the storefront.</p>
      </div>
    </div>
  );
}
