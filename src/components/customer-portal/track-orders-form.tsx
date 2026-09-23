"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestOtpAction, verifyOtpAction } from "@/server/actions/customer-portal/auth";

type Step = "phone" | "code";

// Client-side display only — everything the customer typed themselves, so
// masking it back to them leaks nothing; the server independently enforces
// every real limit (cooldown, attempts, expiry) regardless of what this
// component shows. See docs/PHASE_3_4_REPORT.md "OTP UI".
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `••••••${digits.slice(-4)}`;
}

const DEFAULT_RESEND_COOLDOWN_SECONDS = 45;

export function TrackOrdersForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const phoneId = useId();
  const codeId = useId();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // A purely visual countdown — the server is what actually enforces the
  // cooldown (a resend attempt before it's genuinely over still gets a
  // fresh COOLDOWN response with the real remaining time, which resyncs
  // this). See docs/PHASE_3_4_REPORT.md "Security review" / "OTP resend".
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  function requestCode() {
    setError(null);
    startTransition(async () => {
      const result = await requestOtpAction({ phone });
      if (result.success) {
        setNotice(result.message);
        setStep("code");
        setCode("");
        setCooldownSeconds(DEFAULT_RESEND_COOLDOWN_SECONDS);
        return;
      }

      setError(result.error.message);
      if (result.error.type === "COOLDOWN") {
        // A code was already requested recently — it may still be valid,
        // so let them proceed straight to entering it rather than getting
        // stuck on the phone step.
        setStep("code");
        setCooldownSeconds(result.error.retryAfterSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS);
      }
    });
  }

  function handlePhoneSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || !phone.trim()) return;
    requestCode();
  }

  function handleCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || code.trim().length !== 6) return;
    setError(null);

    startTransition(async () => {
      const result = await verifyOtpAction({ phone, code });
      if (result.success) {
        router.push("/track/orders");
        router.refresh();
        return;
      }
      setError(result.error.message);
      // A wrong guess should let them try again immediately; anything
      // else (expired/locked/no active challenge) means this code is
      // simply done — clearing it makes that visually obvious rather than
      // leaving a code on screen that will never work again.
      if (result.error.type !== "WRONG_CODE") {
        setCode("");
      }
    });
  }

  function handleResend() {
    if (cooldownSeconds > 0 || isPending) return;
    requestCode();
  }

  function handleChangeNumber() {
    setStep("phone");
    setCode("");
    setError(null);
    setNotice(null);
    setCooldownSeconds(0);
  }

  if (step === "phone") {
    return (
      <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4" noValidate>
        {error && (
          <div
            id={`${phoneId}-error`}
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={phoneId}>Mobile number</Label>
          <Input
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${phoneId}-error` : undefined}
            className="h-12 text-base"
          />
        </div>

        <Button type="submit" size="lg" className="mt-2 h-12 w-full text-base" disabled={isPending}>
          {isPending ? "Sending code..." : "Continue"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4" noValidate>
      <button
        type="button"
        onClick={handleChangeNumber}
        className="-mx-2 flex min-h-11 items-center gap-1.5 self-start px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Change number
      </button>

      {notice && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice} Sent to {maskPhone(phone)}.
        </p>
      )}

      {error && (
        <div
          id={`${codeId}-error`}
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={codeId}>6-digit code</Label>
        <Input
          id={codeId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${codeId}-error` : undefined}
          className="h-12 text-center text-2xl tracking-[0.5em]"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={isPending || code.length !== 6}
      >
        {isPending ? "Verifying..." : "Verify"}
      </Button>

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldownSeconds > 0 || isPending}
        className="min-h-11 px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cooldownSeconds > 0 ? `Resend code in ${cooldownSeconds}s` : "Resend code"}
      </button>
    </form>
  );
}
