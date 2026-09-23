"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BRAND, STORE_CONTACT } from "@/lib/constants";

/**
 * Pre-deployment hardening — catches any uncaught exception anywhere
 * under the storefront. In production, Next.js already strips the real
 * `error.message`/stack from what reaches this Client Component for a
 * Server Component error (see node_modules/next/dist/docs .../error.md
 * "error.message" — this is framework behavior, not something this file
 * has to implement), replacing it with a generic message and `digest`, a
 * safe correlation id for matching this to the real, detailed error in
 * server-side logs. This file deliberately never renders `error.message`
 * itself, so it stays safe even if that ever changes.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side logs already have the full detail (Next.js logs the
    // original error there regardless) — this only records that the
    // client observed it, keyed by the same digest, never the message.
    console.error("site error boundary", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">
        We hit a snag loading this page. Please try again — if it keeps happening,{" "}
        <a href={STORE_CONTACT.phoneHref} className="underline underline-offset-2 hover:text-foreground">
          call {BRAND.name} at {STORE_CONTACT.phone}
        </a>{" "}
        and mention the reference code below.
      </p>
      {error.digest && (
        <p className="mt-3 rounded-full bg-secondary px-4 py-1.5 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border px-5 py-2.5 text-sm font-medium hover:bg-muted"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
