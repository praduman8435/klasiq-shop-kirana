"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SchoolClassOption = { id: string; name: string };

const ALL_CLASSES_VALUE = "__all__";

export function GenderClassSelector({
  schoolSlug,
  classes,
  selectedGender,
  selectedClassId,
}: {
  schoolSlug: string;
  classes: SchoolClassOption[];
  selectedGender: "BOYS" | "GIRLS";
  selectedClassId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The trigger's visible label must always be a class NAME, never the
  // raw database id that `value` carries internally — resolved explicitly
  // here (rather than relying on `SelectValue`'s own auto-resolution,
  // which does not reliably match) so a refresh with `?classId=<id>`
  // already in the URL never flashes the id itself.
  const selectedClassName = selectedClassId
    ? (classes.find((c) => c.id === selectedClassId)?.name ?? "All Classes")
    : "All Classes";

  function navigate(next: { gender?: string; classId?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.gender) params.set("gender", next.gender);
    if ("classId" in next) {
      if (next.classId) {
        params.set("classId", next.classId);
      } else {
        params.delete("classId");
      }
    }
    router.push(`/school/${schoolSlug}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        role="tablist"
        aria-label="Uniform group"
        className="inline-flex rounded-lg border border-border/70 bg-muted p-1"
      >
        {(["BOYS", "GIRLS"] as const).map((gender) => (
          <button
            key={gender}
            type="button"
            role="tab"
            aria-selected={selectedGender === gender}
            onClick={() => navigate({ gender })}
            className={cn(
              "rounded-md px-5 py-1.5 text-sm font-medium transition-colors",
              selectedGender === gender
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {gender === "BOYS" ? "Boys" : "Girls"}
          </button>
        ))}
      </div>

      {classes.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Class</span>
          <Select
            value={selectedClassId ?? ALL_CLASSES_VALUE}
            onValueChange={(value) =>
              navigate({ classId: value === ALL_CLASSES_VALUE ? null : (value as string) })
            }
          >
            <SelectTrigger
              aria-label="Filter by class"
              className="h-9 min-w-0 rounded-lg border-border/70 bg-card px-3 text-sm"
            >
              <SelectValue>{selectedClassName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLASSES_VALUE}>All Classes</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
