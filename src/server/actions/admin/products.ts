"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { deriveStockStatus } from "@/lib/stock";
import { rupeesToPaise } from "@/lib/money";
import { setInventoryQuantity } from "@/server/commerce/inventory";
import { deleteProductPhotoIfUnused } from "@/server/product-photos";
import { uniqueProductSlug, uniqueSku } from "@/server/products/codes";
import {
  checkPriceAgainstMrp,
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

  const { firstPack } = parsed.data;
  let firstPackPrices: { priceInPaise: number; mrpInPaise: number | null } | null = null;
  if (firstPack) {
    const priceInPaise = rupeesToPaise(firstPack.priceInRupees);
    const mrpInPaise = firstPack.mrpInRupees == null ? null : rupeesToPaise(firstPack.mrpInRupees);
    const mrpError = checkPriceAgainstMrp(priceInPaise, mrpInPaise);
    if (mrpError) return { success: false, error: { type: "VALIDATION", message: mrpError } };
    firstPackPrices = { priceInPaise, mrpInPaise };
  }

  // A typed web address must be free; a blank one is made from the name.
  let slug = parsed.data.slug || "";
  if (slug) {
    const existing = await db.product.findUnique({ where: { slug } });
    if (existing) {
      return { success: false, error: { type: "CONFLICT", message: "That web address is already used by another product." } };
    }
  } else {
    slug = await uniqueProductSlug(parsed.data.name);
  }

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        categoryId: parsed.data.categoryId,
        brand: parsed.data.brand || null,
        imageUrl: parsed.data.imageUrl || null,
        isActive: parsed.data.isActive,
      },
    });
    if (firstPack && firstPackPrices) {
      const lowStockThreshold = 5;
      await tx.productVariant.create({
        data: {
          productId: created.id,
          size: firstPack.size,
          sku: await uniqueSku(slug, firstPack.size, tx),
          priceInPaise: firstPackPrices.priceInPaise,
          mrpInPaise: firstPackPrices.mrpInPaise,
          stockQuantity: firstPack.stockQuantity,
          lowStockThreshold,
          stockStatus: deriveStockStatus(firstPack.stockQuantity, lowStockThreshold),
          sortOrder: 0,
        },
      });
    }
    return created;
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
      return { success: false, error: { type: "CONFLICT", message: "That web address is already used by another product." } };
    }
  }

  await db.product.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      categoryId: parsed.data.categoryId,
      brand: parsed.data.brand || null,
      imageUrl: parsed.data.imageUrl || null,
      isActive: parsed.data.isActive,
    },
  });
  // A replaced or removed uploaded photo is dead weight in the database.
  if (current.imageUrl !== (parsed.data.imageUrl || null)) await deleteProductPhotoIfUnused(current.imageUrl);

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

  const priceInPaise = rupeesToPaise(parsed.data.priceInRupees);
  const mrpInPaise = parsed.data.mrpInRupees == null ? null : rupeesToPaise(parsed.data.mrpInRupees);
  const mrpError = checkPriceAgainstMrp(priceInPaise, mrpInPaise);
  if (mrpError) {
    return { success: false, error: { type: "VALIDATION", message: mrpError } };
  }

  let sku = parsed.data.sku || "";
  if (sku) {
    const existingSku = await db.productVariant.findUnique({ where: { sku } });
    if (existingSku) {
      return { success: false, error: { type: "CONFLICT", message: "That product code is already used by another pack." } };
    }
  } else {
    const product = await db.product.findUnique({ where: { id: parsed.data.productId }, select: { slug: true } });
    if (!product) return { success: false, error: { type: "NOT_FOUND", message: "Product not found." } };
    sku = await uniqueSku(product.slug, parsed.data.size);
  }
  const existingSize = await db.productVariant.findUnique({
    where: { productId_size: { productId: parsed.data.productId, size: parsed.data.size } },
  });
  if (existingSize) {
    return { success: false, error: { type: "CONFLICT", message: "That pack size already exists for this product." } };
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
      sku,
      priceInPaise,
      mrpInPaise,
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
  const { admin, unauthorized } = await requireAdmin();
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
    return { success: false, error: { type: "NOT_FOUND", message: "Pack size not found." } };
  }

  const priceInPaise = rupeesToPaise(parsed.data.priceInRupees);
  const mrpInPaise =
    parsed.data.mrpInRupees === undefined
      ? current.mrpInPaise
      : parsed.data.mrpInRupees === null
        ? null
        : rupeesToPaise(parsed.data.mrpInRupees);
  const mrpError = checkPriceAgainstMrp(priceInPaise, mrpInPaise);
  if (mrpError) {
    return { success: false, error: { type: "VALIDATION", message: mrpError } };
  }

  const sku = parsed.data.sku || current.sku;
  if (sku !== current.sku) {
    const skuTaken = await db.productVariant.findUnique({ where: { sku } });
    if (skuTaken) {
      return { success: false, error: { type: "CONFLICT", message: "That product code is already used by another pack." } };
    }
  }
  if (parsed.data.size !== current.size) {
    const sizeTaken = await db.productVariant.findUnique({
      where: { productId_size: { productId: current.productId, size: parsed.data.size } },
    });
    if (sizeTaken) {
      return { success: false, error: { type: "CONFLICT", message: "That pack size already exists for this product." } };
    }
  }

  const lowStockThreshold = parsed.data.lowStockThreshold ?? current.lowStockThreshold;
  await db.productVariant.update({
    where: { id: parsed.data.id },
    data: {
      size: parsed.data.size,
      sku,
      priceInPaise,
      mrpInPaise,
      lowStockThreshold,
      stockStatus: deriveStockStatus(current.stockQuantity, lowStockThreshold),
    },
  });

  // Stock goes through the same guarded path as Inventory "Set exact":
  // recorded in the stock history, and refused if a sale changed it
  // since the form was opened (instead of silently undoing that sale).
  const expected = parsed.data.expectedStockQuantity ?? current.stockQuantity;
  if (parsed.data.stockQuantity !== expected) {
    const result = await setInventoryQuantity({
      productVariantId: current.id,
      newQuantity: parsed.data.stockQuantity,
      expectedPreviousQuantity: expected,
      reason: "MANUAL_CORRECTION",
      note: "Edited on the product page",
      adminUserId: admin!.id,
    });
    if (!result.success) {
      revalidateProductViews(current.productId);
      return {
        success: false,
        error: {
          type: result.error.type === "NOT_FOUND" ? "NOT_FOUND" : "CONFLICT",
          message:
            result.error.type === "CONFLICT"
              ? `Price saved, but stock changed to ${current.stockQuantity} (a sale happened). Check it and save the stock again.`
              : result.error.message,
        },
      };
    }
  }

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
    return { success: false, error: { type: "NOT_FOUND", message: "Pack size not found." } };
  }

  try {
    await db.productVariant.delete({ where: { id: parsed.data.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        success: false,
        error: {
          type: "CONFLICT",
          message: "This pack size has order history and can't be deleted — deactivate it instead.",
        },
      };
    }
    throw err;
  }

  revalidateProductViews(variant.productId);
  return { success: true };
}
