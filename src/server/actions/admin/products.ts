"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { deriveStockStatus } from "@/lib/stock";
import { rupeesToPaise } from "@/lib/money";
import {
  createProductSchema,
  createVariantSchema,
  deleteVariantSchema,
  setVariantActiveSchema,
  updateProductSchema,
  updateVariantSchema,
} from "@/lib/validation/admin-products";

export type AdminActionResult<T> =
  | T
  | {
      success: false;
      error: { type: "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND" | "CONFLICT"; message: string };
    };

async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      admin: null,
      unauthorized: {
        success: false as const,
        error: { type: "UNAUTHORIZED" as const, message: "Please sign in again." },
      },
    };
  }
  return { admin, unauthorized: null };
}

function revalidateProductViews(productId?: string) {
  revalidatePath("/admin/products");
  if (productId) revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/inventory");
  revalidatePath("/", "layout");
}

export type CreateProductResult = { success: true; id: string };

export async function createProductAction(
  input: unknown,
): Promise<AdminActionResult<CreateProductResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const existing = await db.product.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return { success: false, error: { type: "CONFLICT", message: "That slug is already in use." } };
  }

  const product = await db.product.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      categoryId: parsed.data.categoryId,
      schoolId: parsed.data.schoolId,
      imageUrl: parsed.data.imageUrl || null,
      isActive: parsed.data.isActive,
    },
  });

  revalidateProductViews(product.id);
  return { success: true, id: product.id };
}

export async function updateProductAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const current = await db.product.findUnique({ where: { id: parsed.data.id } });
  if (!current) {
    return { success: false, error: { type: "NOT_FOUND", message: "Product not found." } };
  }

  if (parsed.data.slug !== current.slug) {
    const slugTaken = await db.product.findUnique({ where: { slug: parsed.data.slug } });
    if (slugTaken) {
      return { success: false, error: { type: "CONFLICT", message: "That slug is already in use." } };
    }
  }

  await db.product.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      categoryId: parsed.data.categoryId,
      schoolId: parsed.data.schoolId,
      imageUrl: parsed.data.imageUrl || null,
      isActive: parsed.data.isActive,
    },
  });

  revalidateProductViews(parsed.data.id);
  return { success: true };
}

export async function createVariantAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createVariantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const existingSku = await db.productVariant.findUnique({ where: { sku: parsed.data.sku } });
  if (existingSku) {
    return { success: false, error: { type: "CONFLICT", message: "That SKU is already in use." } };
  }
  const existingSize = await db.productVariant.findUnique({
    where: { productId_size: { productId: parsed.data.productId, size: parsed.data.size } },
  });
  if (existingSize) {
    return { success: false, error: { type: "CONFLICT", message: "That size already exists for this product." } };
  }

  const maxSortOrder = await db.productVariant.aggregate({
    where: { productId: parsed.data.productId },
    _max: { sortOrder: true },
  });

  const lowStockThreshold = parsed.data.lowStockThreshold ?? 5;
  await db.productVariant.create({
    data: {
      productId: parsed.data.productId,
      size: parsed.data.size,
      sku: parsed.data.sku,
      priceInPaise: rupeesToPaise(parsed.data.priceInRupees),
      stockQuantity: parsed.data.stockQuantity,
      lowStockThreshold,
      stockStatus: deriveStockStatus(parsed.data.stockQuantity, lowStockThreshold),
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  revalidateProductViews(parsed.data.productId);
  return { success: true };
}

export async function updateVariantAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateVariantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const current = await db.productVariant.findUnique({ where: { id: parsed.data.id } });
  if (!current) {
    return { success: false, error: { type: "NOT_FOUND", message: "Size not found." } };
  }

  if (parsed.data.sku !== current.sku) {
    const skuTaken = await db.productVariant.findUnique({ where: { sku: parsed.data.sku } });
    if (skuTaken) {
      return { success: false, error: { type: "CONFLICT", message: "That SKU is already in use." } };
    }
  }
  if (parsed.data.size !== current.size) {
    const sizeTaken = await db.productVariant.findUnique({
      where: { productId_size: { productId: current.productId, size: parsed.data.size } },
    });
    if (sizeTaken) {
      return { success: false, error: { type: "CONFLICT", message: "That size already exists for this product." } };
    }
  }

  const lowStockThreshold = parsed.data.lowStockThreshold ?? current.lowStockThreshold;
  await db.productVariant.update({
    where: { id: parsed.data.id },
    data: {
      size: parsed.data.size,
      sku: parsed.data.sku,
      priceInPaise: rupeesToPaise(parsed.data.priceInRupees),
      stockQuantity: parsed.data.stockQuantity,
      lowStockThreshold,
      stockStatus: deriveStockStatus(parsed.data.stockQuantity, lowStockThreshold),
    },
  });

  revalidateProductViews(current.productId);
  return { success: true };
}

export async function setVariantActiveAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = setVariantActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const variant = await db.productVariant.update({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.isActive },
  });

  revalidateProductViews(variant.productId);
  return { success: true };
}

export async function deleteVariantAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = deleteVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const variant = await db.productVariant.findUnique({ where: { id: parsed.data.id } });
  if (!variant) {
    return { success: false, error: { type: "NOT_FOUND", message: "Size not found." } };
  }

  try {
    await db.productVariant.delete({ where: { id: parsed.data.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        success: false,
        error: {
          type: "CONFLICT",
          message: "This size has order history and can't be deleted — deactivate it instead.",
        },
      };
    }
    throw err;
  }

  revalidateProductViews(variant.productId);
  return { success: true };
}
