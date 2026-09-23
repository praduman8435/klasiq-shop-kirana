import type { Prisma } from "@prisma/client";

export type ProductWithVariants = Prisma.ProductGetPayload<{
  include: { variants: true; category: { select: { slug: true; name: true } } };
}>;

export type RecommendedSetWithItems = Prisma.RecommendedUniformSetGetPayload<{
  include: {
    class: { select: { name: true } };
    items: {
      include: { product: { include: { variants: true } } };
    };
  };
}>;
