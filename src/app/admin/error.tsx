"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Admin equivalent of src/app/(site)/error.tsx — same rule: never render
 * `error.message`, only the safe `error.digest` correlation id. See that
 * file's own doc comment for why Next.js already strips the real message
 * for a Server Component error in production before it reaches here.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin error boundary", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page hit an unexpected error. Nothing was lost — try again, or head back to the dashboard.
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
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
