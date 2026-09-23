import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product/product-card";
import { GenderClassSelector } from "@/components/school/gender-class-selector";
import { RecommendedSetCard } from "@/components/school/recommended-set-card";
import { BRAND } from "@/lib/constants";
import {
  getSchoolAssignedProducts,
  getSchoolBySlug,
  getSchoolRecommendedSets,
} from "@/server/queries/schools";
import { getHeaderCategories, pickBrowseFallbackCategory } from "@/server/queries/categories";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gender?: string; classId?: string }>;
};

function resolveGender(value: string | undefined): "BOYS" | "GIRLS" {
  return value === "GIRLS" ? "GIRLS" : "BOYS";
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);
  if (!school || !school.isActive) {
    return { title: "School Not Found" };
  }
  return {
    title: `${school.name} Uniforms`,
    description: `School uniform collection for ${school.name}. Find the right size, check availability and add to your bag.`,
    alternates: { canonical: `/school/${school.slug}` },
  };
}

/**
 * School storefront redesign — this route previously kept the old light
 * template while every other customer-facing surface moved to the dark
 * Klasiq system (see `isDarkRoute` in route-theme-scope.tsx, which now
 * matches `/school/*`). Same shared `ProductCard`/grid rhythm as every
 * category page — a school is a filtered *view* into the same catalog,
 * not a separate product experience.
 */
export default async function SchoolStorefrontPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school || !school.isActive) {
    notFound();
  }

  const gender = resolveGender(query.gender);
  const classId =
    query.classId && school.classes.some((c) => c.id === query.classId)
      ? query.classId
      : null;

  const [products, recommendedSets, headerCategories] = await Promise.all([
    getSchoolAssignedProducts({ schoolId: school.id, classId, gender }),
    getSchoolRecommendedSets({ schoolId: school.id, classId, gender }),
    getHeaderCategories(),
  ]);
  const browseFallback = pickBrowseFallbackCategory(headerCategories);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {school.isDemo && (
        <div className="mb-4 flex flex-col gap-1">
          <span className="inline-flex w-fit items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            Demo School · Sample Store
          </span>
          <p className="text-xs text-muted-foreground">
            For illustration only — not a real {BRAND.name} partner.
          </p>
        </div>
      )}

      {/* Typography-led identity — no logo/initials block (see section 1 of
          this round's brief: a generic red-square-initials badge read as a
          profile-card affordance, not a retail storefront). School name
          carries the visual weight on its own; the location line (the
          school's own free-text `city` field — already stores compound
          values like "Jahanaganj, Azamgarh" for real schools, never
          fabricated) is the only secondary line. No "Official Uniform
          Partner" / "Uniform Collection" wording — `isVerifiedPartner`
          still exists on the model for future use, this storefront just no
          longer renders any partnership claim from it. */}
      <div>
        <h1 className="font-heading text-xl font-medium tracking-tight sm:text-2xl">
          {school.name}
        </h1>
        {school.city && <p className="mt-1 text-sm text-muted-foreground">{school.city}</p>}
      </div>

      <div className="mt-5 sm:mt-6">
        <GenderClassSelector
          schoolSlug={school.slug}
          classes={school.classes}
          selectedGender={gender}
          selectedClassId={classId}
        />
      </div>

      <div className="mt-5 border-t sm:mt-6" />

      {recommendedSets.length > 0 && (
        <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2">
          {recommendedSets.map((set) => (
            <RecommendedSetCard key={set.id} set={set} />
          ))}
        </div>
      )}

      <div className={recommendedSets.length > 0 ? "mt-6" : "mt-5 sm:mt-6"}>
        {products.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <p className="text-sm font-medium text-foreground">No items for this selection</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try the other gender tab, or{" "}
              {browseFallback ? (
                <Link href={`/${browseFallback.slug}`} className="underline underline-offset-2">
                  browse {browseFallback.name.toLowerCase()}
                </Link>
              ) : (
                <Link href="/search" className="underline underline-offset-2">
                  search our full catalog
                </Link>
              )}
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
