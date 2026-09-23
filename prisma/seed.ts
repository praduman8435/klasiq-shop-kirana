/**
 * Demo data seed. Everything created here is clearly fictional and flagged
 * isDemo: true — none of it represents a real school partnership.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient, type UniformGender } from "@prisma/client";
import { deriveStockStatus } from "../src/lib/stock";

const db = new PrismaClient();

type VariantSeed = {
  size: string;
  priceInPaise: number;
  stockQuantity: number;
  lowStockThreshold?: number;
};

function sku(productSlug: string, size: string) {
  return `${productSlug}-${size}`.toUpperCase().replace(/\s+/g, "");
}

async function upsertProduct(params: {
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  schoolId?: string;
  imageUrl: string;
  variants: VariantSeed[];
}) {
  const product = await db.product.upsert({
    where: { slug: params.slug },
    create: {
      slug: params.slug,
      name: params.name,
      description: params.description,
      categoryId: params.categoryId,
      schoolId: params.schoolId,
      imageUrl: params.imageUrl,
      isDemo: true,
    },
    update: {
      name: params.name,
      description: params.description,
      categoryId: params.categoryId,
      schoolId: params.schoolId,
      imageUrl: params.imageUrl,
    },
  });

  for (const [index, variant] of params.variants.entries()) {
    const lowStockThreshold = variant.lowStockThreshold ?? 5;
    await db.productVariant.upsert({
      where: { productId_size: { productId: product.id, size: variant.size } },
      create: {
        productId: product.id,
        size: variant.size,
        sku: sku(params.slug, variant.size),
        priceInPaise: variant.priceInPaise,
        stockQuantity: variant.stockQuantity,
        lowStockThreshold,
        stockStatus: deriveStockStatus(variant.stockQuantity, lowStockThreshold),
        sortOrder: index,
      },
      update: {
        priceInPaise: variant.priceInPaise,
        stockQuantity: variant.stockQuantity,
        lowStockThreshold,
        stockStatus: deriveStockStatus(variant.stockQuantity, lowStockThreshold),
      },
    });
  }

  return product;
}

async function main() {
  console.log("Seeding demo data...");

  // --- Categories --------------------------------------------------------
  const [uniformsCategory, shoesCategory, socksCategory, bagsCategory] =
    await Promise.all([
      // Phase 3.6.7 Part 1 — displayInHeader/headerOrder are set ONLY in
      // `create`, never `update`: a fresh database's seed run must
      // reproduce the same four header links Phase 3.6.7's own migration
      // backfill gives an EXISTING database (see that migration's own
      // comment for why the backfill alone can't cover a fresh database
      // — it runs before this script ever inserts a row). Re-running
      // seed against a database an admin has already configured must
      // never silently overwrite their real choices, exactly like this
      // upsert already never re-touches `sortOrder` on repeat runs.
      db.category.upsert({
        where: { slug: "uniforms" },
        create: { slug: "uniforms", name: "School Uniforms", sortOrder: 0, displayInHeader: true, headerOrder: 0 },
        update: { name: "School Uniforms" },
      }),
      db.category.upsert({
        where: { slug: "shoes" },
        create: { slug: "shoes", name: "Shoes", sortOrder: 1, displayInHeader: true, headerOrder: 1 },
        update: { name: "Shoes" },
      }),
      db.category.upsert({
        where: { slug: "socks" },
        create: { slug: "socks", name: "Socks", sortOrder: 2, displayInHeader: true, headerOrder: 2 },
        update: { name: "Socks" },
      }),
      db.category.upsert({
        where: { slug: "school-bags" },
        create: { slug: "school-bags", name: "School Bags", sortOrder: 3, displayInHeader: true, headerOrder: 3 },
        update: { name: "School Bags" },
      }),
    ]);

  // --- Schools -------------------------------------------------------------
  const sunrise = await db.school.upsert({
    where: { slug: "demo-sunrise-public-school" },
    create: {
      slug: "demo-sunrise-public-school",
      name: "Demo Sunrise Public School",
      city: "Springfield",
      logoUrl: "/demo/schools/sunrise-logo.svg",
      isActive: true,
      isDemo: true,
    },
    update: {},
  });

  const valley = await db.school.upsert({
    where: { slug: "demo-valley-academy" },
    create: {
      slug: "demo-valley-academy",
      name: "Demo Valley Academy",
      city: "Riverside",
      logoUrl: "/demo/schools/valley-logo.svg",
      isActive: true,
      isDemo: true,
    },
    update: {},
  });

  // An inactive demo school to exercise the "school not found / not
  // available" path without deleting data.
  await db.school.upsert({
    where: { slug: "demo-old-town-school" },
    create: {
      slug: "demo-old-town-school",
      name: "Demo Old Town School",
      city: "Oldtown",
      isActive: false,
      isDemo: true,
    },
    update: {},
  });

  const sunriseClassNames = [
    "Nursery",
    "LKG",
    "UKG",
    "Class 1",
    "Class 2",
    "Class 3",
    "Class 4",
    "Class 5",
    "Class 6",
    "Class 7",
    "Class 8",
  ];
  const sunriseClasses: Record<string, string> = {};
  for (const [index, name] of sunriseClassNames.entries()) {
    const cls = await db.schoolClass.upsert({
      where: { schoolId_name: { schoolId: sunrise.id, name } },
      create: { schoolId: sunrise.id, name, sortOrder: index },
      update: {},
    });
    sunriseClasses[name] = cls.id;
  }

  const valleyClassNames = ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"];
  const valleyClasses: Record<string, string> = {};
  for (const [index, name] of valleyClassNames.entries()) {
    const cls = await db.schoolClass.upsert({
      where: { schoolId_name: { schoolId: valley.id, name } },
      create: { schoolId: valley.id, name, sortOrder: index },
      update: {},
    });
    valleyClasses[name] = cls.id;
  }

  // --- Generic products (reused across schools) -----------------------------
  const whiteShirt = await upsertProduct({
    slug: "white-shirt",
    name: "White Shirt",
    description: "Half-sleeve white cotton-blend school shirt.",
    categoryId: uniformsCategory.id,
    imageUrl: "/demo/products/white-shirt.svg",
    variants: [
      { size: "22", priceInPaise: 32000, stockQuantity: 18 },
      { size: "24", priceInPaise: 32000, stockQuantity: 22 },
      { size: "26", priceInPaise: 33000, stockQuantity: 20 },
      { size: "28", priceInPaise: 35000, stockQuantity: 15 },
      { size: "30", priceInPaise: 35000, stockQuantity: 12 },
      { size: "32", priceInPaise: 38000, stockQuantity: 4, lowStockThreshold: 5 },
      { size: "34", priceInPaise: 38000, stockQuantity: 0 },
      { size: "36", priceInPaise: 40000, stockQuantity: 9 },
    ],
  });

  const greyPant = await upsertProduct({
    slug: "grey-pant",
    name: "Grey Pant",
    description: "Durable grey school trousers with adjustable waist.",
    categoryId: uniformsCategory.id,
    imageUrl: "/demo/products/grey-pant.svg",
    variants: [
      { size: "24", priceInPaise: 38000, stockQuantity: 20 },
      { size: "26", priceInPaise: 38000, stockQuantity: 18 },
      { size: "28", priceInPaise: 40000, stockQuantity: 16 },
      { size: "30", priceInPaise: 42000, stockQuantity: 10 },
      { size: "32", priceInPaise: 42000, stockQuantity: 3 },
      { size: "34", priceInPaise: 45000, stockQuantity: 0 },
    ],
  });

  const whiteSkirt = await upsertProduct({
    slug: "white-skirt",
    name: "White Skirt",
    description: "Pleated white school skirt with elastic waistband.",
    categoryId: uniformsCategory.id,
    imageUrl: "/demo/products/white-skirt.svg",
    variants: [
      { size: "24", priceInPaise: 36000, stockQuantity: 14 },
      { size: "26", priceInPaise: 36000, stockQuantity: 12 },
      { size: "28", priceInPaise: 38000, stockQuantity: 11 },
      { size: "30", priceInPaise: 38000, stockQuantity: 4 },
      { size: "32", priceInPaise: 40000, stockQuantity: 8 },
    ],
  });

  const blackPant = await upsertProduct({
    slug: "black-pant",
    name: "Black Pant",
    description: "Formal black school trousers.",
    categoryId: uniformsCategory.id,
    imageUrl: "/demo/products/black-pant.svg",
    variants: [
      { size: "28", priceInPaise: 42000, stockQuantity: 10 },
      { size: "30", priceInPaise: 42000, stockQuantity: 10 },
      { size: "32", priceInPaise: 45000, stockQuantity: 6 },
    ],
  });

  const schoolTie = await upsertProduct({
    slug: "school-tie",
    name: "School Tie",
    description: "Elastic school tie, one size fits all.",
    categoryId: uniformsCategory.id,
    imageUrl: "/demo/products/school-tie.svg",
    variants: [{ size: "One Size", priceInPaise: 15000, stockQuantity: 40 }],
  });

  const schoolBelt = await upsertProduct({
    slug: "school-belt",
    name: "School Belt",
    description: "Black school belt with buckle.",
    categoryId: uniformsCategory.id,
    imageUrl: "/demo/products/school-belt.svg",
    variants: [
      { size: "S", priceInPaise: 12000, stockQuantity: 25 },
      { size: "M", priceInPaise: 12000, stockQuantity: 22 },
      { size: "L", priceInPaise: 13000, stockQuantity: 2, lowStockThreshold: 5 },
    ],
  });

  const sweater = await upsertProduct({
    slug: "sweater",
    name: "Sweater",
    description: "V-neck woollen-blend school sweater for winter wear.",
    categoryId: uniformsCategory.id,
    imageUrl: "/demo/products/sweater.svg",
    variants: [
      { size: "26", priceInPaise: 55000, stockQuantity: 12 },
      { size: "28", priceInPaise: 55000, stockQuantity: 10 },
      { size: "30", priceInPaise: 58000, stockQuantity: 8 },
      { size: "32", priceInPaise: 58000, stockQuantity: 0 },
      { size: "34", priceInPaise: 60000, stockQuantity: 6 },
    ],
  });

  const socks = await upsertProduct({
    slug: "school-socks",
    name: "School Socks (Pair)",
    description: "White ankle-length school socks, sold per pair.",
    categoryId: socksCategory.id,
    imageUrl: "/demo/products/socks.svg",
    variants: [
      { size: "S (up to 10 yrs)", priceInPaise: 6000, stockQuantity: 60 },
      { size: "M (11-14 yrs)", priceInPaise: 6500, stockQuantity: 45 },
      { size: "L (Adult)", priceInPaise: 7000, stockQuantity: 30 },
    ],
  });

  const schoolShoes = await upsertProduct({
    slug: "school-shoes-black",
    name: "School Shoes — Black",
    description: "Lace-up black school shoes with reinforced sole.",
    categoryId: shoesCategory.id,
    imageUrl: "/demo/products/school-shoes.svg",
    variants: [
      { size: "UK 1", priceInPaise: 65000, stockQuantity: 10 },
      { size: "UK 2", priceInPaise: 65000, stockQuantity: 12 },
      { size: "UK 3", priceInPaise: 70000, stockQuantity: 9 },
      { size: "UK 4", priceInPaise: 70000, stockQuantity: 4 },
      { size: "UK 5", priceInPaise: 75000, stockQuantity: 0 },
      { size: "UK 6", priceInPaise: 75000, stockQuantity: 7 },
    ],
  });

  const schoolBag = await upsertProduct({
    slug: "school-bag",
    name: "School Bag",
    description: "Padded-strap school backpack with multiple compartments.",
    categoryId: bagsCategory.id,
    imageUrl: "/demo/products/school-bag.svg",
    variants: [
      { size: "Small", priceInPaise: 85000, stockQuantity: 15 },
      { size: "Medium", priceInPaise: 95000, stockQuantity: 12 },
      { size: "Large", priceInPaise: 105000, stockQuantity: 6 },
    ],
  });

  const trolleyBag = await upsertProduct({
    slug: "trolley-bag",
    name: "School Trolley Bag",
    description: "Wheeled school trolley bag with telescopic handle.",
    categoryId: bagsCategory.id,
    imageUrl: "/demo/products/trolley-bag.svg",
    variants: [
      { size: "Standard", priceInPaise: 145000, stockQuantity: 8 },
      { size: "Large", priceInPaise: 165000, stockQuantity: 3, lowStockThreshold: 5 },
    ],
  });

  // --- School-specific products ---------------------------------------------
  const sunriseBlazer = await upsertProduct({
    slug: "demo-sunrise-embroidered-blazer",
    name: "Sunrise Embroidered Blazer",
    description:
      "Navy blazer with the Demo Sunrise Public School crest, for winter formal wear.",
    categoryId: uniformsCategory.id,
    schoolId: sunrise.id,
    imageUrl: "/demo/products/sunrise-blazer.svg",
    variants: [
      { size: "26", priceInPaise: 120000, stockQuantity: 6 },
      { size: "28", priceInPaise: 120000, stockQuantity: 5, lowStockThreshold: 5 },
      { size: "30", priceInPaise: 130000, stockQuantity: 4 },
      { size: "32", priceInPaise: 130000, stockQuantity: 0 },
    ],
  });

  const valleyHouseTee = await upsertProduct({
    slug: "demo-valley-house-colour-tee",
    name: "Valley House Colour T-Shirt",
    description: "House-colour PE t-shirt exclusive to Demo Valley Academy.",
    categoryId: uniformsCategory.id,
    schoolId: valley.id,
    imageUrl: "/demo/products/valley-house-tee.svg",
    variants: [
      { size: "24", priceInPaise: 28000, stockQuantity: 20 },
      { size: "26", priceInPaise: 28000, stockQuantity: 18 },
      { size: "28", priceInPaise: 30000, stockQuantity: 14 },
      { size: "30", priceInPaise: 30000, stockQuantity: 0 },
    ],
  });

  // --- Assignments: Demo Sunrise Public School --------------------------------
  const sunriseAllClassesBoys: Array<[string, number]> = [
    [whiteShirt.id, 0],
    [greyPant.id, 1],
    [schoolTie.id, 2],
    [schoolBelt.id, 3],
    [socks.id, 4],
    [schoolShoes.id, 5],
    [sunriseBlazer.id, 6],
  ];
  const sunriseAllClassesGirls: Array<[string, number]> = [
    [whiteShirt.id, 0],
    [whiteSkirt.id, 1],
    [schoolTie.id, 2],
    [schoolBelt.id, 3],
    [socks.id, 4],
    [schoolShoes.id, 5],
    [sunriseBlazer.id, 6],
  ];

  // Not using the schoolUniformAssignment.upsert() shorthand here: the
  // compound unique index includes the nullable `classId`, and matching a
  // NULL column via the generated compound-unique `where` is unreliable
  // across Prisma versions. findFirst + create/update is unambiguous.
  async function assign(
    schoolId: string,
    classId: string | null,
    gender: UniformGender,
    productId: string,
    sortOrder: number,
  ) {
    const existing = await db.schoolUniformAssignment.findFirst({
      where: { schoolId, classId, gender, productId },
    });
    if (existing) {
      await db.schoolUniformAssignment.update({
        where: { id: existing.id },
        data: { sortOrder },
      });
    } else {
      await db.schoolUniformAssignment.create({
        data: { schoolId, classId, gender, productId, sortOrder },
      });
    }
  }

  for (const [productId, sortOrder] of sunriseAllClassesBoys) {
    await assign(sunrise.id, null, "BOYS", productId, sortOrder);
  }
  for (const [productId, sortOrder] of sunriseAllClassesGirls) {
    await assign(sunrise.id, null, "GIRLS", productId, sortOrder);
  }

  // Sweater only assigned to the younger classes (Nursery through Class 5) —
  // demonstrates a class-scoped assignment rather than a school-wide one.
  const sunriseYoungerClasses = [
    "Nursery",
    "LKG",
    "UKG",
    "Class 1",
    "Class 2",
    "Class 3",
    "Class 4",
    "Class 5",
  ];
  for (const className of sunriseYoungerClasses) {
    await assign(sunrise.id, sunriseClasses[className], "BOYS", sweater.id, 7);
    await assign(sunrise.id, sunriseClasses[className], "GIRLS", sweater.id, 7);
  }

  // --- Assignments: Demo Valley Academy (reuses several generic products) -----
  const valleyBoys: Array<[string, number]> = [
    [whiteShirt.id, 0],
    [greyPant.id, 1],
    [socks.id, 2],
    [schoolShoes.id, 3],
    [valleyHouseTee.id, 4],
  ];
  const valleyGirls: Array<[string, number]> = [
    [whiteShirt.id, 0],
    [whiteSkirt.id, 1],
    [socks.id, 2],
    [schoolShoes.id, 3],
    [valleyHouseTee.id, 4],
  ];
  for (const [productId, sortOrder] of valleyBoys) {
    await assign(valley.id, null, "BOYS", productId, sortOrder);
  }
  for (const [productId, sortOrder] of valleyGirls) {
    await assign(valley.id, null, "GIRLS", productId, sortOrder);
  }

  // --- Recommended complete sets ---------------------------------------------
  const sunriseClass7BoysSet = await db.recommendedUniformSet.upsert({
    where: { id: "seed-sunrise-class7-boys-set" },
    create: {
      id: "seed-sunrise-class7-boys-set",
      schoolId: sunrise.id,
      classId: sunriseClasses["Class 7"],
      gender: "BOYS",
      name: "Class 7 — Boys — Complete Uniform",
      description: "Everything a Class 7 boy needs for the school year.",
    },
    update: {},
  });

  const class7BoysItems: Array<[string, number, number]> = [
    [whiteShirt.id, 2, 0],
    [greyPant.id, 2, 1],
    [schoolTie.id, 1, 2],
    [schoolBelt.id, 1, 3],
    [socks.id, 3, 4],
  ];
  for (const [productId, quantity, sortOrder] of class7BoysItems) {
    await db.recommendedUniformSetItem.upsert({
      where: { setId_productId: { setId: sunriseClass7BoysSet.id, productId } },
      create: { setId: sunriseClass7BoysSet.id, productId, quantity, sortOrder },
      update: { quantity, sortOrder },
    });
  }

  const valleyClass2GirlsSet = await db.recommendedUniformSet.upsert({
    where: { id: "seed-valley-class2-girls-set" },
    create: {
      id: "seed-valley-class2-girls-set",
      schoolId: valley.id,
      classId: valleyClasses["Class 2"],
      gender: "GIRLS",
      name: "Class 2 — Girls — Complete Uniform",
      description: "Everything a Class 2 girl needs for the school year.",
    },
    update: {},
  });

  const class2GirlsItems: Array<[string, number, number]> = [
    [whiteShirt.id, 2, 0],
    [whiteSkirt.id, 2, 1],
    [socks.id, 3, 2],
  ];
  for (const [productId, quantity, sortOrder] of class2GirlsItems) {
    await db.recommendedUniformSetItem.upsert({
      where: { setId_productId: { setId: valleyClass2GirlsSet.id, productId } },
      create: { setId: valleyClass2GirlsSet.id, productId, quantity, sortOrder },
      update: { quantity, sortOrder },
    });
  }

  // Generic products not tied to any school, so /uniforms, /shoes, /socks,
  // /school-bags have content for a parent whose school isn't listed:
  void blackPant;
  void schoolBag;
  void trolleyBag;

  console.log("Seed complete.");
  console.log(`  Schools: ${sunrise.name}, ${valley.name} (+1 inactive demo school)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
