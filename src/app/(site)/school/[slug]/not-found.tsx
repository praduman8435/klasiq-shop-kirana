import Link from "next/link";
import { SchoolSearch } from "@/components/site/school-search";
import { getHeaderCategories, pickBrowseFallbackCategory } from "@/server/queries/categories";

export default async function SchoolNotFound() {
  const headerCategories = await getHeaderCategories();
  const browseFallback = pickBrowseFallbackCategory(headerCategories);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">
        We couldn&apos;t find that school
      </h1>
      <p className="mt-2 text-muted-foreground">
        The link may be outdated, or the school isn&apos;t set up with us
        yet. Try searching instead:
      </p>
      <SchoolSearch size="compact" className="mt-6" />
      <p className="mt-6 text-sm text-muted-foreground">
        {browseFallback ? (
          <>
            Or browse{" "}
            <Link href={`/${browseFallback.slug}`} className="underline underline-offset-2">
              {browseFallback.name.toLowerCase()}
            </Link>{" "}
            that work for most schools.
          </>
        ) : (
          <>
            Or{" "}
            <Link href="/search" className="underline underline-offset-2">
              search our full catalog
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
