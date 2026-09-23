"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A generic version of `KhataBookPagination`'s own pattern
 * (src/components/admin/khatabook-pagination.tsx) — real server-side
 * pagination via a URL param, never a client-side slice of an
 * already-loaded array. Parameterized by `basePath`/`itemLabel` so this
 * one component can back any admin directory (Suppliers today) without
 * copy-pasting the KhataBook-specific version — that one is left exactly
 * as it is rather than risking a regression on an already-shipped,
 * verified feature for an unrelated change.
 *
 * `paramName` (Phase 4 Part 3) defaults to `"page"` — every existing
 * caller keeps its exact prior behavior unchanged. It exists so a page
 * with TWO independent paginated lists (e.g. Supplier Detail's purchase
 * history AND payment history) can give each its own URL param instead
 * of the two fighting over one `page` value.
 */
export function AdminPagination({
  basePath,
  itemLabel,
  page,
  totalPages,
  totalCount,
  pageSize,
  paramName = "page",
}: {
  basePath: string;
  itemLabel: string;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  paramName?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) {
      params.delete(paramName);
    } else {
      params.set(paramName, String(next));
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalCount);

  if (totalCount === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {firstRow}–{lastRow} of {totalCount} {itemLabel}
        {totalCount === 1 ? "" : "s"}
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
