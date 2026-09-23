"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Section 19 — real pagination over the complete directory, not a
 * client-side slice of an already-small array: every page change is a
 * fresh server request via a `page` URL param, preserving whatever
 * `q`/`filter` are already active. Never touches `q`/`filter` itself, so
 * moving between pages never resets the current search/filter.
 */
export function KhataBookPagination({
  page,
  totalPages,
  totalCount,
  pageSize,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(next));
    }
    router.push(`/admin/khatabook?${params.toString()}`);
  }

  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalCount);

  if (totalCount === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {firstRow}–{lastRow} of {totalCount} customer{totalCount === 1 ? "" : "s"}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </button>
          <span className="px-2 text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-sm text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
