import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardMetricGroup } from "@/components/admin/stat-card";
import { SchoolForm } from "@/components/admin/school-form";
import { SchoolClassesManager } from "@/components/admin/school-classes-manager";
import { SchoolAssignmentsManager } from "@/components/admin/school-assignments-manager";
import { SchoolRecommendedSetsManager } from "@/components/admin/school-recommended-sets-manager";
import { getAdminSchoolById, getAssignableProductsForSchool } from "@/server/queries/admin/schools";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const school = await getAdminSchoolById(id);
  return { title: school?.name ?? "School" };
}

export default async function AdminSchoolDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [school, products] = await Promise.all([
    getAdminSchoolById(id),
    getAssignableProductsForSchool(id),
  ]);
  if (!school) notFound();

  return (
    // AdminShell establishes the dark scope + background for the whole
    // admin application; this page just renders directly into it.
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href="/admin/schools"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Schools
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">{school.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">/school/{school.slug}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!school.isActive && (
              <Badge variant="outline" className="border-border text-muted-foreground">
                Inactive
              </Badge>
            )}
            {school.isVerifiedPartner && (
              <Badge variant="outline" className="border-transparent bg-primary/15 text-primary">
                Verified Partner
              </Badge>
            )}
            {school.isDemo && (
              <Badge variant="outline" className="border-border text-muted-foreground opacity-70">
                Demo
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Derived from the already-fetched `school` — no extra query.
          Orders isn't included here since `getAdminSchoolById` doesn't
          fetch an order count (unlike the list page's own
          `getAdminSchools`), and adding one just for this overview would
          violate "no extra queries just to make the UI prettier." */}
      <div className="mb-6">
        <DashboardMetricGroup
          metrics={[
            { label: "Classes", value: school.classes.length },
            { label: "Uniform items", value: school.assignments.length },
          ]}
        />
      </div>

      <section>
        <h2 className="text-sm font-semibold">School details</h2>
        <div className="mt-2 max-w-xl">
          <SchoolForm
            initial={{
              id: school.id,
              name: school.name,
              slug: school.slug,
              city: school.city ?? "",
              logoUrl: school.logoUrl ?? "",
              isActive: school.isActive,
              isVerifiedPartner: school.isVerifiedPartner,
            }}
          />
        </div>
      </section>

      <div className="my-6 border-t border-border" />

      <section>
        <h2 className="text-sm font-semibold">Classes</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Grades/classes this school uses — needed for class-specific uniform items and sets.
        </p>
        <div className="mt-2">
          <SchoolClassesManager schoolId={school.id} classes={school.classes} />
        </div>
      </section>

      <div className="my-6 border-t border-border" />

      <section>
        <h2 className="text-sm font-semibold">Uniform assignments</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Which products this school&apos;s storefront shows, per class and gender group. Leave
          class as &quot;All Classes&quot; for items every student needs.
        </p>
        <div className="mt-2">
          <SchoolAssignmentsManager
            schoolId={school.id}
            assignments={school.assignments}
            classes={school.classes}
            products={products}
          />
        </div>
      </section>

      <div className="my-6 border-t border-border" />

      <section>
        <h2 className="text-sm font-semibold">Recommended uniform sets</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shown to parents on the school storefront as a one-tap &quot;Add Complete Set.&quot;
        </p>
        <div className="mt-2">
          <SchoolRecommendedSetsManager
            schoolId={school.id}
            sets={school.recommendedSets}
            classes={school.classes}
            products={products}
          />
        </div>
      </section>
    </div>
  );
}
