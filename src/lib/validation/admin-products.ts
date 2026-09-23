import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
  schoolId: z.string().min(1).nullable(),
  imageUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
  isActive: z.boolean(),
});

export const createProductSchema = productFormSchema;
export const updateProductSchema = productFormSchema.extend({ id: z.string().min(1) });

export const variantFormSchema = z.object({
  size: z.string().trim().min(1, "Size is required.").max(30),
  sku: z.string().trim().min(1, "SKU is required.").max(60),
  priceInRupees: z.coerce.number().min(0, "Price cannot be negative."),
  stockQuantity: z.coerce.number().int().min(0, "Stock cannot be negative."),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
});

export const createVariantSchema = variantFormSchema.extend({ productId: z.string().min(1) });
export const updateVariantSchema = variantFormSchema.extend({ id: z.string().min(1) });
export const setVariantActiveSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });
export const deleteVariantSchema = z.object({ id: z.string().min(1) });

export const adminProductFiltersSchema = z.object({
  query: z.string().trim().max(100).optional(),
  categorySlug: z.string().trim().max(60).optional(),
});
