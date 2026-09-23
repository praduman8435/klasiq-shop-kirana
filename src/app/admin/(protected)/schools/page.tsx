import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SchoolSearchInput } from "@/components/admin/school-search-input";
import { getAdminSchools } from "@/server/queries/admin/schools";

export const metadata: Metadata = { title: "Schools" };

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function AdminSchoolsPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const schools = await getAdminSchools(q);
  const hasActiveFilters = Boolean(q?.trim());

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Schools</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {schools.length} school{schools.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button render={<Link href="/admin/schools/new" />} nativeButton={false} className="h-9">
          <Plus className="size-4" aria-hidden />
          Add School
        </Button>
      </div>

      <SchoolSearchInput />

      {schools.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {hasActiveFilters ? "No schools match your search" : "No schools yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try a different name."
              : "Add your first school to start configuring its storefront."}
          </p>
          {!hasActiveFilters && (
            <Button render={<Link href="/admin/schools/new" />} nativeButton={false} className="mt-4 h-9">
              <Plus className="size-4" aria-hidden />
              Add School
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {schools.map((school) => (
              <li key={school.id}>
                <Link
                  href={`/admin/schools/${school.id}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{school.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      /school/{school.slug}
                      {school.city ? ` · ${school.city}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {school._count.classes} class{school._count.classes === 1 ? "" : "es"} ·{" "}
                      {school._count.assignments} item{school._count.assignments === 1 ? "" : "s"} ·{" "}
                      {school._count.orders} order{school._count.orders === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
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
                    <ChevronRight
                      className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
