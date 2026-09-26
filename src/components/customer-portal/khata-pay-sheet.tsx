"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, Copy, Loader2, Smartphone } from "lucide-react";
import { CustomerSheet } from "@/components/customer-portal/customer-sheet";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { buildUpiPayLink } from "@/lib/upi";
import { cn } from "@/lib/utils";
import { claimKhataPaymentAction } from "@/server/actions/customer-portal/khata";

type Step = "pay" | "tell" | "sent";

const fieldClass =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring";

/**
 * Pay udhaar online: choose how much, pay the shop by UPI (QR for another
 * phone, or straight into the UPI app on this one), then say "I've paid"
 * so the shop can find it in its UPI app and clear it from the khata.
 */
export function KhataPaySheet({
  payableInPaise,
  upiId,
  payeeName,
  customerName,
}: {
  payableInPaise: number;
  upiId: string;
  payeeName: string;
  customerName: string | null;
}) {
  const router = useRouter();
  const amountId = useId();
  const refId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pay");
  const [amount, setAmount] = useState(String(payableInPaise / 100));
  const [reference, setReference] = useState("");
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amountInPaise = rupeesToPaise(Number(amount) || 0);
  const amountOk = amountInPaise > 0 && amountInPaise <= payableInPaise;
  const link = buildUpiPayLink({
    upiId,
    payeeName,
    amountInPaise: amountOk ? amountInPaise : payableInPaise,
    note: `Khata${customerName ? ` ${customerName}` : ""}`,
  });

  useEffect(() => {
    if (!open || step !== "pay") return;
    let alive = true;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((svg) => alive && setQrSvg(svg))
      .catch(() => alive && setQrSvg(null));
    return () => {
      alive = false;
    };
  }, [link, open, step]);

  function start() {
    setStep("pay");
    setAmount(String(payableInPaise / 100));
    setReference("");
    setError(null);
    setOpen(true);
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  function tellShop() {
    setError(null);
    startTransition(async () => {
      const result = await claimKhataPaymentAction({ amountInRupees: amount, upiReference: reference || undefined });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setStep("sent");
      router.refresh();
    });
  }

  const quick = [payableInPaise, 50000, 20000, 10000].filter((v, i, all) => v <= payableInPaise && all.indexOf(v) === i);

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-[0_2px_8px_oklch(0.54_0.21_27/28%)] transition-[background-color,transform] hover:bg-brand-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Pay {formatPaise(payableInPaise)} by UPI
      </button>

      <CustomerSheet
        open={open}
        onOpenChange={(next) => !isPending && setOpen(next)}
        title={step === "sent" ? "Sent to the shop" : step === "tell" ? "Tell the shop you've paid" : "Pay by UPI"}
        description={
          step === "sent"
            ? "They'll check their UPI app and clear it from your khata. You'll see it here once they do."
            : step === "tell"
              ? "The shop checks this against their UPI app before updating your khata."
              : `To ${payeeName}. Pay from any UPI app.`
        }
      >
        {step === "pay" && (
          <>
            <label htmlFor={amountId} className="text-sm font-bold">
              Amount
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-base font-bold text-muted-foreground">₹</span>
              <input
                id={amountId}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={cn(fieldClass, "pl-8 text-lg font-extrabold tabular-nums")}
                aria-invalid={!amountOk}
                aria-describedby={`${amountId}-hint`}
              />
            </div>
            <p id={`${amountId}-hint`} className={cn("mt-1.5 text-xs", amountOk ? "text-muted-foreground" : "font-semibold text-destructive")}>
              {amountOk ? `You can pay part now. Up to ${formatPaise(payableInPaise)}.` : `Enter up to ${formatPaise(payableInPaise)}.`}
            </p>
            {quick.length > 1 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {quick.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v / 100))}
                    className={cn(
                      "h-9 rounded-full border px-3.5 text-sm font-bold tabular-nums transition-colors",
                      amountInPaise === v ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
                    )}
                  >
                    {v === payableInPaise ? `Full ${formatPaise(v)}` : formatPaise(v)}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-col items-center rounded-2xl border border-border p-4">
              <div
                className={cn("size-48 transition-opacity [&>svg]:size-full", !amountOk && "opacity-30")}
                role="img"
                aria-label={`UPI QR code to pay ${formatPaise(amountOk ? amountInPaise : payableInPaise)} to ${payeeName}`}
                dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
              />
              <p className="mt-2 text-xs text-muted-foreground">Scan with GPay, PhonePe, Paytm or any UPI app</p>
              <button
                type="button"
                onClick={copyUpiId}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold hover:bg-muted"
              >
                {copied ? <Check className="size-4 text-emerald-700" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {upiId}
                <span className="sr-only">{copied ? "copied" : "copy UPI ID"}</span>
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              <a
                href={amountOk ? link : undefined}
                aria-disabled={!amountOk}
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-[0_2px_8px_oklch(0.54_0.21_27/28%)] hover:bg-brand-deep sm:hidden",
                  !amountOk && "pointer-events-none opacity-40",
                )}
              >
                <Smartphone className="size-5" aria-hidden />
                Open UPI app
              </a>
              <button
                type="button"
                disabled={!amountOk}
                onClick={() => setStep("tell")}
                className="h-12 rounded-xl border border-border text-base font-bold text-foreground hover:bg-muted disabled:opacity-40"
              >
                I&apos;ve paid {amountOk ? formatPaise(amountInPaise) : ""}
              </button>
            </div>
          </>
        )}

        {step === "tell" && (
          <>
            <label htmlFor={`${amountId}-paid`} className="text-sm font-bold">
              Amount you paid
            </label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-base font-bold text-muted-foreground">₹</span>
              <input
                id={`${amountId}-paid`}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={cn(fieldClass, "pl-8 text-lg font-extrabold tabular-nums")}
              />
            </div>

            <label htmlFor={refId} className="mt-4 text-sm font-bold">
              UPI reference <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id={refId}
              value={reference}
              onChange={(e) => setReference(e.target.value.replace(/[^A-Za-z0-9 -]/g, "").slice(0, 40))}
              placeholder="12-digit UPI Ref No."
              inputMode="numeric"
              className={cn(fieldClass, "mt-1.5 tabular-nums")}
              aria-describedby={`${refId}-hint`}
            />
            <p id={`${refId}-hint`} className="mt-1.5 text-xs text-muted-foreground">
              Find it in your UPI app on the payment receipt. It helps the shop find your payment faster.
            </p>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-semibold text-accent-foreground">
                {error}
              </p>
            )}

            <div className="mt-6 grid gap-2">
              <button
                type="button"
                onClick={tellShop}
                disabled={isPending || !amountOk}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-base font-extrabold text-primary-foreground hover:bg-brand-deep disabled:opacity-40"
              >
                {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {isPending ? "Sending…" : `Tell the shop I paid ${amountOk ? formatPaise(amountInPaise) : ""}`}
              </button>
              <button
                type="button"
                onClick={() => setStep("pay")}
                disabled={isPending}
                className="h-11 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Back to payment
              </button>
            </div>
          </>
        )}

        {step === "sent" && (
          <>
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Check className="size-8" strokeWidth={2.5} aria-hidden />
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 h-12 rounded-xl bg-foreground text-base font-extrabold text-background hover:opacity-90"
            >
              Done
            </button>
          </>
        )}
      </CustomerSheet>
    </>
  );
}
