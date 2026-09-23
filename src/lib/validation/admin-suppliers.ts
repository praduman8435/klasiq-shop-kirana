import { z } from "zod";

export const SUPPLIER_DIRECTORY_FILTER_VALUES = ["ALL", "ACTIVE", "INACTIVE"] as const;

// Mirrors productFormSchema's/schoolFormSchema's own shape and field-length
// conventions (src/lib/validation/admin-products.ts, admin-schools.ts).
// `phone` and `gstNumber` are deliberately loose (no regex) — see
// Supplier.phone/gstNumber's own schema doc comments (prisma/schema.prisma)
// for why: there is no existing project-wide phone/GST validation rule to
// reuse for a supplier (unlike Customer's OTP-verified phone), and
// inventing a strict one risks rejecting real, legitimately-formatted
// supplier-provided values.
export const supplierFormSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  businessName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  addressLine: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
  isActive: z.boolean(),
});

export const createSupplierSchema = supplierFormSchema;
export const updateSupplierSchema = supplierFormSchema.extend({ id: z.string().min(1) });

export const setSupplierActiveSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });

// Mirrors khataBookSearchSchema's own `page`/`filter` shape exactly
// (src/lib/validation/admin-khatabook.ts) — same forgiving `.catch()`
// fallback for a bad/hand-edited URL, same reset-to-page-1 convention.
export const adminSupplierFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  filter: z.enum(SUPPLIER_DIRECTORY_FILTER_VALUES).catch("ALL"),
});
