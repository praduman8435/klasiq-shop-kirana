import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A path on this site ("/products/atta.webp", "/api/product-photos/…"),
 * never protocol-relative ("//evil.example"). */
const SITE_PATH_PATTERN = /^\/(?!\/)[^\s]*$/;

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(150),
  slug: z
    .string()
    .trim()
    .min(2, "Slug is required.")
    .max(100)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens only."),
  description: z.string().trim().max(500).optional(),
  categoryId: z.string().min(1, "Choose a category."),
  brand: z.string().trim().max(60).optional(),
  /** An uploaded photo or bundled image (a site path), or a full link. */
  imageUrl: z
    .union([
      z.string().trim().max(500).regex(SITE_PATH_PATTERN, "Choose the photo again."),
      z.string().trim().url().max(500).regex(/^https?:\/\//i, "Use an https:// link."),
      z.literal(""),
    ])
    .optional(),
  isActive: z.boolean(),
});

/** The first pack size, entered together with a new product so it's
 * sellable in one step. The code (SKU) is generated. */
export const firstPackSchema = z.object({
  size: z.string().trim().min(1, "Enter the pack size, like 1 kg.").max(30),
  priceInRupees: z.coerce.number({ message: "Enter the selling price." }).positive("Enter the selling price."),
  mrpInRupees: z.coerce.number().positive("MRP must be more than zero.").nullable().optional(),
  stockQuantity: z.coerce.number().int().min(0, "Stock cannot be negative.").default(0),
});

/** On create the web address (slug) is optional — it's made from the name. */
export const createProductSchema = productFormSchema.extend({
  slug: z
    .string()
    .trim()
    .max(100)
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, "Use lowercase letters, numbers and hyphens only.")
    .optional(),
  firstPack: firstPackSchema.optional(),
});
export const updateProductSchema = productFormSchema.extend({ id: z.string().min(1) });

export const variantFormSchema = z.object({
  size: z.string().trim().min(1, "Pack size is required.").max(30),
  /** Blank = generate one from the product and pack size. */
  sku: z.string().trim().max(60).optional(),
  priceInRupees: z.coerce.number().min(0, "Price cannot be negative."),
  /** Printed MRP. `null` clears it (loose/unbranded goods); omitted
   * (`undefined`) on an update leaves the stored MRP unchanged. */
  mrpInRupees: z.coerce.number().positive("MRP must be more than zero.").nullable().optional(),
  stockQuantity: z.coerce.number().int().min(0, "Stock cannot be negative."),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
});

export const createVariantSchema = variantFormSchema.extend({ productId: z.string().min(1) });
export const updateVariantSchema = variantFormSchema.extend({
  id: z.string().min(1),
  /** The stock the form was showing, so a sale made meanwhile isn't overwritten. */
  expectedStockQuantity: z.coerce.number().int().min(0).optional(),
});
export const setVariantActiveSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });
export const deleteVariantSchema = z.object({ id: z.string().min(1) });

export const PRODUCT_STOCK_FILTERS = ["out", "low", "hidden"] as const;
export type ProductStockFilter = (typeof PRODUCT_STOCK_FILTERS)[number];

export const adminProductFiltersSchema = z.object({
  query: z.string().trim().max(100).optional(),
  categorySlug: z.string().trim().max(60).optional(),
  stock: z.enum(PRODUCT_STOCK_FILTERS).optional().catch(undefined),
});

/**
 * Selling above the printed MRP isn't allowed, so a pack's price may never
 * exceed its MRP. Checked in paise (never floating-point rupees) by the
 * variant create/update actions against the MRP that will actually be
 * stored — on an update that omits MRP, that's the existing value.
 * Returns an error message, or `null` when the price is fine.
 */
export function checkPriceAgainstMrp(priceInPaise: number, mrpInPaise: number | null): string | null {
  if (mrpInPaise === null) return null;
  return priceInPaise > mrpInPaise ? "Price can't be more than the MRP." : null;
}
