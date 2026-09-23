import Link from "next/link";
import { BRAND } from "@/lib/constants";

/**
 * Phase 3.7 Part 1 — global fallback `not-found.tsx`. Next.js renders the
 * nearest `not-found.tsx` up the route-segment tree for any `notFound()`
 * call (or unmatched URL) that has no closer one of its own — before this
 * file existed, that meant Next's stock, unbranded 404 page for every
 * route with no dedicated `not-found.tsx` (which, until this phase, was
 * every route except `/school/[slug]`). This is the catch-all: routes
 * with no surrounding layout chrome (the invoice pages, which deliberately
 * render outside the `(site)`/admin layout groups — see
 * docs/PHASE_3_6_6_REPORT.md Part 2) fall through to exactly this, kept
 * intentionally minimal to match their own chrome-free presentation.
 * `(site)/not-found.tsx` and admin's own error boundary take precedence
 * for routes inside those groups, being closer in the tree.
 */
export default function GlobalNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        Go to {BRAND.name}
      </Link>
    </div>
  );
}
