"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/admin/product-form";
import type { CouponFormValues } from "@/lib/coupon-form-values";
import { couponHeadline, describeCoupon } from "@/lib/coupons";
import { rupeesToPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createCouponAction, updateCouponAction } from "@/server/actions/admin/coupons";

const TYPES = [
  { key: "FLAT", label: "₹ off", hint: "A fixed amount" },
  { key: "PERCENT", label: "% off", hint: "A share of the bill" },
  { key: "FREE_DELIVERY", label: "Free delivery", hint: "No delivery charge" },
] as const;

const num = (v: string) => v.replace(/[^\d.]/g, "");
const whole = (v: string) => v.replace(/\D/g, "");

function randomCode() {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  return `KIRANA${pick()}${pick()}${Math.floor(10 + Math.random() * 90)}`;
}

/**
 * Create or change an offer code. What the customer will see is previewed
 * live on the ticket at the top, so the owner can check the wording before
 * saving.
 */
export function CouponForm({ initial }: { initial: CouponFormValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ids = {
    code: useId(),
    percent: useId(),
    flat: useId(),
    max: useId(),
    min: useId(),
    starts: useId(),
    expires: useId(),
    limit: useId(),
    per: useId(),
  };
  const set = (patch: Partial<CouponFormValues>) => setV((prev) => ({ ...prev, ...patch }));

  const preview = {
    type: v.type,
    value: v.type === "PERCENT" ? Number(v.percent) || 0 : v.type === "FLAT" ? rupeesToPaise(Number(v.flat) || 0) : 0,
    maxDiscountInPaise: v.type === "PERCENT" && v.maxDiscount ? rupeesToPaise(Number(v.maxDiscount)) : null,
    minOrderInPaise: rupeesToPaise(Number(v.minOrder) || 0),
    firstOrderOnly: v.firstOrderOnly,
  };

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const payload = {
      code: v.code,
      type: v.type,
      percent: v.type === "PERCENT" ? v.percent || 0 : undefined,
      flatInRupees: v.type === "FLAT" ? v.flat || 0 : undefined,
      maxDiscountInRupees: v.type === "PERCENT" && v.maxDiscount ? v.maxDiscount : null,
      minOrderInRupees: v.minOrder || 0,
      startsOn: v.startsOn,
      expiresOn: v.expiresOn,
      usageLimit: v.usageLimit ? v.usageLimit : null,
      perCustomerLimit: v.perCustomerLimit || 1,
      firstOrderOnly: v.firstOrderOnly,
      showOnWebsite: v.showOnWebsite,
      isActive: v.isActive,
    };
    startTransition(async () => {
      const result = v.id ? await updateCouponAction({ id: v.id, ...payload }) : await createCouponAction(payload);
      if (!result.success) return setError(result.message);
      toast.success(v.id ? "Offer saved" : `Offer ${v.code.toUpperCase()} created`);
      router.push("/admin/offers");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6" noValidate>
      {/* How customers will see it. */}
      <div className="flex items-stretch overflow-hidden rounded-xl border border-dashed border-primary/50 bg-primary/5">
        <div className="flex w-28 shrink-0 flex-col items-center justify-center border-r border-dashed border-primary/40 px-2 py-4 text-center">
          <span className="font-heading text-lg leading-tight font-semibold text-primary">{couponHeadline(preview)}</span>
        </div>
        <div className="min-w-0 flex-1 px-4 py-3">
          <p className="font-mono text-base font-semibold tracking-wider">{v.code.toUpperCase() || "CODE"}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{describeCoupon(preview)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {v.expiresOn ? `Valid till ${new Date(`${v.expiresOn}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "No end date"}
            {v.perCustomerLimit === "1" ? " · once per customer" : v.perCustomerLimit ? ` · ${v.perCustomerLimit} times per customer` : ""}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.code}>Code customers type</Label>
        <div className="flex gap-2">
          <Input
            id={ids.code}
            value={v.code}
            onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })}
            placeholder="e.g. SAVE50"
            className="h-10 font-mono tracking-wider uppercase"
            autoFocus={!v.id}
          />
          <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => set({ code: randomCode() })}>
            <Shuffle className="size-4" aria-hidden />
            Make one
          </Button>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">What customers get</legend>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={v.type === t.key}
              onClick={() => set({ type: t.key })}
              className={cn(
                "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                v.type === t.key ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/40",
              )}
            >
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {v.type === "FLAT" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.flat}>Rupees off</Label>
            <Input id={ids.flat} inputMode="decimal" className="h-10 tabular-nums" placeholder="₹50" value={v.flat} onChange={(e) => set({ flat: num(e.target.value) })} />
          </div>
        )}
        {v.type === "PERCENT" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.percent}>Percent off</Label>
              <Input id={ids.percent} inputMode="numeric" className="h-10 tabular-nums" placeholder="10" value={v.percent} onChange={(e) => set({ percent: whole(e.target.value).slice(0, 3) })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.max}>
                Up to <span className="font-normal text-muted-foreground">(optional cap)</span>
              </Label>
              <Input id={ids.max} inputMode="decimal" className="h-10 tabular-nums" placeholder="₹100" value={v.maxDiscount} onChange={(e) => set({ maxDiscount: num(e.target.value) })} />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.min}>
            Minimum order <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id={ids.min} inputMode="decimal" className="h-10 tabular-nums" placeholder="₹0" value={v.minOrder} onChange={(e) => set({ minOrder: num(e.target.value) })} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.starts}>
            Starts <span className="font-normal text-muted-foreground">(blank = now)</span>
          </Label>
          <Input id={ids.starts} type="date" className="h-10" value={v.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.expires}>
            Last day <span className="font-normal text-muted-foreground">(blank = no end)</span>
          </Label>
          <Input id={ids.expires} type="date" className="h-10" value={v.expiresOn} onChange={(e) => set({ expiresOn: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.limit}>
            Total uses <span className="font-normal text-muted-foreground">(blank = no limit)</span>
          </Label>
          <Input id={ids.limit} inputMode="numeric" className="h-10 tabular-nums" placeholder="e.g. 100" value={v.usageLimit} onChange={(e) => set({ usageLimit: whole(e.target.value) })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.per}>Uses per customer</Label>
          <Input id={ids.per} inputMode="numeric" className="h-10 tabular-nums" value={v.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: whole(e.target.value).slice(0, 3) })} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Switch
          checked={v.firstOrderOnly}
          onChange={(firstOrderOnly) => set({ firstOrderOnly })}
          label="First online order only"
          hint="Only for mobile numbers that have never ordered online. Great for bringing counter customers online."
        />
        <Switch
          checked={v.showOnWebsite}
          onChange={(showOnWebsite) => set({ showOnWebsite })}
          label="Show in “Offers for you”"
          hint={v.showOnWebsite ? "Customers see it in the bag and at checkout and can tap to apply." : "Secret code: only people you tell can use it."}
        />
        <Switch checked={v.isActive} onChange={(isActive) => set({ isActive })} label="Offer is on" hint={v.isActive ? "Customers can use it." : "Paused. Nobody can use it until you turn it on."} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="h-11 min-w-36 text-base" disabled={isPending}>
          {isPending ? "Saving…" : v.id ? "Save offer" : "Create offer"}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => router.push("/admin/offers")} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
