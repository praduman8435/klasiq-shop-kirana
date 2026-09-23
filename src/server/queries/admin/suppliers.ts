import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type SupplierDirectoryFilter = "ALL" | "ACTIVE" | "INACTIVE";

const SUPPLIER_DIRECTORY_PAGE_SIZE = 25;

export type SupplierDirectoryResult = {
  suppliers: Array<{
    id: string;
    name: string;
    businessName: string | null;
    phone: string | null;
    city: string | null;
    isActive: boolean;
  }>;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

/**
 * The Supplier directory — real server-side pagination over the complete
 * table, mirroring `getKhataBookCustomerDirectory`'s own shape exactly
 * (src/server/queries/admin/khatabook.ts): a `page`/`filter`/`query` triple
 * in, `{ suppliers, page, pageSize, totalCount, totalPages }` out, so the
 * list page never needs a `take: 5`-style shortcut and search/filter
 * changes always reset to page 1 (enforced by the caller never carrying
 * `page` forward, not by anything here).
 *
 * Search matches name, business name, and phone via one `OR` — the same
 * three fields Part 1's own supplier form actually collects, never a
 * field this model doesn't have.
 */
export async function getSupplierDirectory(params: {
  query?: string;
  filter?: SupplierDirectoryFilter;
  page?: number;
}): Promise<SupplierDirectoryResult> {
  const pageSize = SUPPLIER_DIRECTORY_PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);
  const trimmedQuery = params.query?.trim();
  const filter = params.filter ?? "ALL";

  const where: Prisma.SupplierWhereInput = {
    ...(trimmedQuery
      ? {
          OR: [
            { name: { contains: trimmedQuery, mode: "insensitive" as const } },
            { businessName: { contains: trimmedQuery, mode: "insensitive" as const } },
            { phone: { contains: trimmedQuery } },
          ],
        }
      : {}),
    ...(filter === "ACTIVE" ? { isActive: true } : {}),
    ...(filter === "INACTIVE" ? { isActive: false } : {}),
  };

  const [totalCount, suppliers] = await Promise.all([
    db.supplier.count({ where }),
    db.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, businessName: true, phone: true, city: true, isActive: true },
    }),
  ]);

  return {
    suppliers,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export async function getAdminSupplierById(id: string) {
  return db.supplier.findUnique({ where: { id } });
}
