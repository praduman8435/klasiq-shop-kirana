import Link from "next/link";
import { Compass } from "lucide-react";
import { SchoolSearch } from "@/components/site/school-search";

/**
 * Phase 3.7 Part 1 — storefront-specific 404, rendered inside the `(site)`
 * layout (so it keeps the header/footer, unlike the chrome-free root
 * fallback at src/app/not-found.tsx) for any `notFound()` under this
 * group without a more specific `not-found.tsx` of its own — most
 * notably an invalid/typo'd `/{categorySlug}`. `/school/[slug]` keeps its
 * own more specific `not-found.tsx` (closer in the tree, so it still
 * wins for that route).
 */
export default function SiteNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 font-heading text-2xl font-semibold">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 text-muted-foreground">
        The link may be outdated, or the page may have moved. Try searching
        for your school instead:
      </p>
      <SchoolSearch size="compact" className="mt-6" />
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Go to homepage
      </Link>
    </div>
  );
}
