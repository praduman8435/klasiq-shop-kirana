/**
 * Demo data seed for local development. Every product created here is
 * flagged isDemo: true — prices, MRPs and stock are illustrative only,
 * never a claim about the real store's shelves. Replace with the store's
 * real catalogue before going live.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { deriveStockStatus } from "../src/lib/stock";

const db = new PrismaClient();

type VariantSeed = {
  /** Pack size, e.g. "1 kg" — stored in ProductVariant.size. */
  size: string;
  priceInPaise: number;
  mrpInPaise?: number;
  stockQuantity: number;
  lowStockThreshold?: number;
};

type ProductSeed = {
  slug: string;
  name: string;
  brand?: string;
  description: string;
  variants: VariantSeed[];
};

type CategorySeed = {
  slug: string;
  name: string;
  products: ProductSeed[];
};

const rupees = (value: number) => Math.round(value * 100);

function sku(productSlug: string, size: string) {
  return `${productSlug}-${size}`.toUpperCase().replace(/\s+/g, "");
}

/** The eight header aisles. Order here is the header order on a fresh
 * database. */
const CATALOG: CategorySeed[] = [
  {
    slug: "atta-rice-dal",
    name: "Atta, Rice & Dal",
    products: [
      {
        slug: "whole-wheat-atta",
        name: "Whole Wheat Atta",
        brand: "Aashirvaad",
        description: "Chakki-ground whole wheat flour for soft rotis.",
        variants: [
          { size: "1 kg", priceInPaise: rupees(62), mrpInPaise: rupees(68), stockQuantity: 30 },
          { size: "5 kg", priceInPaise: rupees(285), mrpInPaise: rupees(310), stockQuantity: 12 },
          { size: "10 kg", priceInPaise: rupees(540), mrpInPaise: rupees(590), stockQuantity: 4 },
        ],
      },
      {
        slug: "basmati-rice",
        name: "Basmati Rice",
        brand: "India Gate",
        description: "Long-grain aged basmati for pulao and biryani.",
        variants: [
          { size: "1 kg", priceInPaise: rupees(135), mrpInPaise: rupees(150), stockQuantity: 20 },
          { size: "5 kg", priceInPaise: rupees(620), mrpInPaise: rupees(690), stockQuantity: 6 },
        ],
      },
      {
        slug: "toor-dal",
        name: "Toor Dal",
        description: "Unpolished arhar dal, packed in-store.",
        variants: [
          { size: "500 g", priceInPaise: rupees(85), stockQuantity: 25 },
          { size: "1 kg", priceInPaise: rupees(165), stockQuantity: 18 },
        ],
      },
      {
        slug: "chana-dal",
        name: "Chana Dal",
        description: "Split Bengal gram, packed in-store.",
        variants: [
          { size: "500 g", priceInPaise: rupees(55), stockQuantity: 20 },
          { size: "1 kg", priceInPaise: rupees(105), stockQuantity: 3 },
        ],
      },
    ],
  },
  {
    slug: "oil-ghee-masale",
    name: "Oil, Ghee & Masale",
    products: [
      {
        slug: "mustard-oil",
        name: "Kachi Ghani Mustard Oil",
        brand: "Fortune",
        description: "Cold-pressed mustard oil.",
        variants: [
          { size: "1 L", priceInPaise: rupees(165), mrpInPaise: rupees(185), stockQuantity: 24 },
          { size: "5 L", priceInPaise: rupees(790), mrpInPaise: rupees(880), stockQuantity: 5 },
        ],
      },
      {
        slug: "desi-ghee",
        name: "Pure Desi Ghee",
        brand: "Amul",
        description: "Cow ghee made from fresh cream.",
        variants: [
          { size: "500 ml", priceInPaise: rupees(305), mrpInPaise: rupees(320), stockQuantity: 10 },
          { size: "1 L", priceInPaise: rupees(600), mrpInPaise: rupees(630), stockQuantity: 6 },
        ],
      },
      {
        slug: "iodised-salt",
        name: "Iodised Salt",
        brand: "Tata",
        description: "Vacuum-evaporated iodised salt.",
        variants: [{ size: "1 kg", priceInPaise: rupees(28), mrpInPaise: rupees(28), stockQuantity: 40 }],
      },
      {
        slug: "turmeric-powder",
        name: "Turmeric Powder",
        brand: "Everest",
        description: "Ground haldi with natural colour.",
        variants: [
          { size: "100 g", priceInPaise: rupees(34), mrpInPaise: rupees(38), stockQuantity: 30 },
          { size: "200 g", priceInPaise: rupees(65), mrpInPaise: rupees(72), stockQuantity: 15 },
        ],
      },
    ],
  },
  {
    slug: "dairy-bread-eggs",
    name: "Dairy, Bread & Eggs",
    products: [
      {
        slug: "toned-milk",
        name: "Toned Milk",
        brand: "Amul",
        description: "Pasteurised toned milk pouch.",
        variants: [{ size: "500 ml", priceInPaise: rupees(28), mrpInPaise: rupees(28), stockQuantity: 40, lowStockThreshold: 10 }],
      },
      {
        slug: "brown-bread",
        name: "Brown Bread",
        description: "Soft whole-wheat sandwich loaf.",
        variants: [{ size: "400 g", priceInPaise: rupees(45), mrpInPaise: rupees(50), stockQuantity: 8 }],
      },
      {
        slug: "farm-eggs",
        name: "Farm Eggs",
        description: "Fresh white eggs.",
        variants: [
          { size: "Pack of 6", priceInPaise: rupees(42), stockQuantity: 20 },
          { size: "Tray of 30", priceInPaise: rupees(195), stockQuantity: 4 },
        ],
      },
    ],
  },
  {
    slug: "snacks-packaged-food",
    name: "Snacks & Packaged Food",
    products: [
      {
        slug: "glucose-biscuits",
        name: "Glucose Biscuits",
        brand: "Parle-G",
        description: "The everyday tea-time biscuit.",
        variants: [
          { size: "250 g", priceInPaise: rupees(25), mrpInPaise: rupees(25), stockQuantity: 50 },
          { size: "800 g", priceInPaise: rupees(80), mrpInPaise: rupees(85), stockQuantity: 12 },
        ],
      },
      {
        slug: "aloo-bhujia",
        name: "Aloo Bhujia",
        brand: "Haldiram's",
        description: "Crispy spiced potato namkeen.",
        variants: [
          { size: "200 g", priceInPaise: rupees(55), mrpInPaise: rupees(60), stockQuantity: 25 },
          { size: "400 g", priceInPaise: rupees(105), mrpInPaise: rupees(115), stockQuantity: 10 },
        ],
      },
      {
        slug: "instant-noodles",
        name: "Masala Instant Noodles",
        brand: "Maggi",
        description: "Two-minute masala noodles.",
        variants: [
          { size: "70 g", priceInPaise: rupees(14), mrpInPaise: rupees(14), stockQuantity: 60, lowStockThreshold: 12 },
          { size: "Pack of 4", priceInPaise: rupees(54), mrpInPaise: rupees(56), stockQuantity: 15 },
        ],
      },
    ],
  },
  {
    slug: "tea-coffee-drinks",
    name: "Tea, Coffee & Drinks",
    products: [
      {
        slug: "premium-tea",
        name: "Premium Leaf Tea",
        brand: "Tata Tea",
        description: "Strong CTC leaf tea for kadak chai.",
        variants: [
          { size: "250 g", priceInPaise: rupees(135), mrpInPaise: rupees(150), stockQuantity: 18 },
          { size: "500 g", priceInPaise: rupees(265), mrpInPaise: rupees(290), stockQuantity: 9 },
        ],
      },
      {
        slug: "instant-coffee",
        name: "Instant Coffee",
        brand: "Nescafé",
        description: "Classic instant coffee jar.",
        variants: [{ size: "50 g", priceInPaise: rupees(180), mrpInPaise: rupees(195), stockQuantity: 7 }],
      },
    ],
  },
  {
    slug: "personal-care",
    name: "Personal Care",
    products: [
      {
        slug: "bath-soap",
        name: "Bath Soap",
        brand: "Lifebuoy",
        description: "Germ-protection bathing bar.",
        variants: [
          { size: "100 g", priceInPaise: rupees(38), mrpInPaise: rupees(40), stockQuantity: 30 },
          { size: "Pack of 4", priceInPaise: rupees(140), mrpInPaise: rupees(160), stockQuantity: 10 },
        ],
      },
      {
        slug: "toothpaste",
        name: "Toothpaste",
        brand: "Colgate",
        description: "Cavity-protection toothpaste.",
        variants: [{ size: "200 g", priceInPaise: rupees(110), mrpInPaise: rupees(122), stockQuantity: 14 }],
      },
      {
        slug: "coconut-hair-oil",
        name: "Coconut Hair Oil",
        brand: "Parachute",
        description: "Pure coconut oil.",
        variants: [{ size: "200 ml", priceInPaise: rupees(98), mrpInPaise: rupees(105), stockQuantity: 2 }],
      },
    ],
  },
  {
    slug: "cleaning-household",
    name: "Cleaning & Household",
    products: [
      {
        slug: "detergent-powder",
        name: "Detergent Powder",
        brand: "Surf Excel",
        description: "Washing powder for machine and hand wash.",
        variants: [
          { size: "1 kg", priceInPaise: rupees(135), mrpInPaise: rupees(150), stockQuantity: 16 },
          { size: "3 kg", priceInPaise: rupees(390), mrpInPaise: rupees(430), stockQuantity: 0 },
        ],
      },
      {
        slug: "dishwash-bar",
        name: "Dishwash Bar",
        brand: "Vim",
        description: "Lemon dishwash bar.",
        variants: [{ size: "300 g", priceInPaise: rupees(30), mrpInPaise: rupees(32), stockQuantity: 25 }],
      },
    ],
  },
  {
    slug: "pooja-samagri",
    name: "Pooja Samagri",
    products: [
      {
        slug: "agarbatti",
        name: "Agarbatti",
        brand: "Cycle",
        description: "Fragrant incense sticks.",
        variants: [{ size: "Pack of 100", priceInPaise: rupees(60), mrpInPaise: rupees(65), stockQuantity: 20 }],
      },
      {
        slug: "camphor-tablets",
        name: "Camphor Tablets",
        description: "Pure kapoor tablets for aarti.",
        variants: [{ size: "50 g", priceInPaise: rupees(45), stockQuantity: 15 }],
      },
    ],
  },
];

async function upsertProduct(categoryId: string, params: ProductSeed) {
  const product = await db.product.upsert({
    where: { slug: params.slug },
    create: {
      slug: params.slug,
      name: params.name,
      brand: params.brand ?? null,
      description: params.description,
      categoryId,
      isDemo: true,
    },
    update: {
      name: params.name,
      brand: params.brand ?? null,
      description: params.description,
      categoryId,
    },
  });

  for (const [index, variant] of params.variants.entries()) {
    if (variant.mrpInPaise !== undefined && variant.priceInPaise > variant.mrpInPaise) {
      throw new Error(`Seed error: ${params.slug} ${variant.size} is priced above its MRP.`);
    }
    const lowStockThreshold = variant.lowStockThreshold ?? 5;
    const data = {
      priceInPaise: variant.priceInPaise,
      mrpInPaise: variant.mrpInPaise ?? null,
      stockQuantity: variant.stockQuantity,
      lowStockThreshold,
      stockStatus: deriveStockStatus(variant.stockQuantity, lowStockThreshold),
    };
    await db.productVariant.upsert({
      where: { productId_size: { productId: product.id, size: variant.size } },
      create: {
        productId: product.id,
        size: variant.size,
        sku: sku(params.slug, variant.size),
        sortOrder: index,
        ...data,
      },
      update: data,
    });
  }

  return product;
}

async function main() {
  console.log("Seeding demo data...");

  let productCount = 0;
  for (const [index, categorySeed] of CATALOG.entries()) {
    // displayInHeader/headerOrder/sortOrder are set ONLY in `create`,
    // never `update`: re-running the seed against a database an admin has
    // already configured must never silently overwrite their real header
    // choices.
    const category = await db.category.upsert({
      where: { slug: categorySeed.slug },
      create: {
        slug: categorySeed.slug,
        name: categorySeed.name,
        sortOrder: index,
        displayInHeader: true,
        headerOrder: index,
      },
      update: { name: categorySeed.name },
    });

    for (const productSeed of categorySeed.products) {
      await upsertProduct(category.id, productSeed);
      productCount += 1;
    }
  }

  console.log("Seed complete.");
  console.log(`  Categories: ${CATALOG.length}, demo products: ${productCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
