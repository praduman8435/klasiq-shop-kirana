import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Phase 3.6.7 Part 1 — a header position is a small, curated ordinal
// (how many categories will ever realistically appear in a header nav),
// never a large/free-form number; bounded mainly to reject obvious
// accidental input (e.g. a pasted timestamp), not because larger values
// are unsafe.
const MAX_HEADER_ORDER = 999;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(80),
  slug: z
    .string()
    .trim()
    .min(2, "Slug is required.")
    .max(60)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens only."),
  description: z.string().trim().max(300).optional(),
  /// Section 3 — "Display in Header." Defaults false: a brand-new
  /// category never appears in the header until an admin opts it in.
  displayInHeader: z.boolean().default(false),
  /// Section 3 — "Header Order." Only meaningful while displayInHeader
  /// is true (see the schema's own doc comment) — always validated and
  /// stored regardless, so toggling displayInHeader back on later
  /// remembers the last position rather than resetting it.
  headerOrder: z.coerce.number().int().min(0).max(MAX_HEADER_ORDER).default(0),
});

export const createCategorySchema = categoryFormSchema;
export const updateCategorySchema = categoryFormSchema.extend({ id: z.string().min(1) });
export const deleteCategorySchema = z.object({ id: z.string().min(1) });
