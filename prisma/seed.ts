/**
 * Demo data seed for local development. Every product created here is
 * flagged isDemo: true — prices, MRPs and stock are illustrative only,
 * never a claim about the real store's shelves. Replace with the store's
 * real catalogue before going live.
 *
 * Run with: npm run db:seed
 *
 * SEED_MODE=add-only only ADDS what's missing — new categories, new
 * products (with their pack sizes) and photos for products that have
 * none — and never touches an existing product's name, price, MRP or
 * stock. Use it against a live database the store has already edited:
 *   SEED_MODE=add-only npm run db:seed
 */
import { existsSync } from "node:fs";
import path from "node:path";
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
  /** A photo in public/products/ (see public/products/CREDITS.md). */
  imageUrl?: string;
  description: string;
  variants: VariantSeed[];
};

type CategorySeed = {
  slug: string;
  name: string;
  products: ProductSeed[];
};

const ADD_ONLY = process.env.SEED_MODE === "add-only";

/** A product's photo is public/products/{slug}.webp when that file exists. */
function photoFor(params: ProductSeed): string | null {
  if (params.imageUrl) return params.imageUrl;
  const file = path.join(
    process.cwd(),
    "public",
    "products",
    `${params.slug}.webp`,
  );
  return existsSync(file) ? `/products/${params.slug}.webp` : null;
}

const rupees = (value: number) => Math.round(value * 100);

function sku(productSlug: string, size: string) {
  return `${productSlug}-${size}`.toUpperCase().replace(/\s+/g, "");
}

/** The header aisles. Order here is the header order on a fresh
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
          {
            size: "1 kg",
            priceInPaise: rupees(62),
            mrpInPaise: rupees(68),
            stockQuantity: 30,
          },
          {
            size: "5 kg",
            priceInPaise: rupees(285),
            mrpInPaise: rupees(310),
            stockQuantity: 12,
          },
          {
            size: "10 kg",
            priceInPaise: rupees(540),
            mrpInPaise: rupees(590),
            stockQuantity: 4,
          },
        ],
      },
      {
        slug: "basmati-rice",
        name: "Basmati Rice",
        brand: "India Gate",
        description: "Long-grain aged basmati for pulao and biryani.",
        variants: [
          {
            size: "1 kg",
            priceInPaise: rupees(135),
            mrpInPaise: rupees(150),
            stockQuantity: 20,
          },
          {
            size: "5 kg",
            priceInPaise: rupees(620),
            mrpInPaise: rupees(690),
            stockQuantity: 6,
          },
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
      {
        slug: "moong-dal",
        name: "Moong Dal",
        description: "Yellow split moong, light and quick to cook.",
        variants: [
          { size: "500 g", priceInPaise: rupees(70), stockQuantity: 20 },
          { size: "1 kg", priceInPaise: rupees(135), stockQuantity: 10 },
        ],
      },
      {
        slug: "masoor-dal",
        name: "Masoor Dal",
        description: "Red split lentils for everyday dal.",
        variants: [
          { size: "500 g", priceInPaise: rupees(60), stockQuantity: 20 },
          { size: "1 kg", priceInPaise: rupees(115), stockQuantity: 10 },
        ],
      },
      {
        slug: "poha",
        name: "Poha",
        description: "Medium-thick flattened rice for breakfast poha.",
        variants: [
          { size: "500 g", priceInPaise: rupees(35), stockQuantity: 25 },
          { size: "1 kg", priceInPaise: rupees(65), stockQuantity: 10 },
        ],
      },
      {
        slug: "sugar",
        name: "Sugar",
        description: "Fine white crystal sugar.",
        variants: [
          { size: "1 kg", priceInPaise: rupees(48), stockQuantity: 30 },
          { size: "5 kg", priceInPaise: rupees(230), stockQuantity: 8 },
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
          {
            size: "1 L",
            priceInPaise: rupees(165),
            mrpInPaise: rupees(185),
            stockQuantity: 24,
          },
          {
            size: "5 L",
            priceInPaise: rupees(790),
            mrpInPaise: rupees(880),
            stockQuantity: 5,
          },
        ],
      },
      {
        slug: "desi-ghee",
        name: "Pure Desi Ghee",
        brand: "Amul",
        description: "Cow ghee made from fresh cream.",
        variants: [
          {
            size: "500 ml",
            priceInPaise: rupees(305),
            mrpInPaise: rupees(320),
            stockQuantity: 10,
          },
          {
            size: "1 L",
            priceInPaise: rupees(600),
            mrpInPaise: rupees(630),
            stockQuantity: 6,
          },
        ],
      },
      {
        slug: "iodised-salt",
        name: "Iodised Salt",
        brand: "Tata",
        description: "Vacuum-evaporated iodised salt.",
        variants: [
          {
            size: "1 kg",
            priceInPaise: rupees(28),
            mrpInPaise: rupees(28),
            stockQuantity: 40,
          },
        ],
      },
      {
        slug: "turmeric-powder",
        name: "Turmeric Powder",
        brand: "Everest",
        description: "Ground haldi with natural colour.",
        variants: [
          {
            size: "100 g",
            priceInPaise: rupees(34),
            mrpInPaise: rupees(38),
            stockQuantity: 30,
          },
          {
            size: "200 g",
            priceInPaise: rupees(65),
            mrpInPaise: rupees(72),
            stockQuantity: 15,
          },
        ],
      },
      {
        slug: "red-chilli-powder",
        name: "Red Chilli Powder",
        description: "Ground lal mirch for colour and heat.",
        variants: [
          { size: "100 g", priceInPaise: rupees(40), stockQuantity: 25 },
          { size: "200 g", priceInPaise: rupees(75), stockQuantity: 12 },
        ],
      },
      {
        slug: "coriander-seeds",
        name: "Dhania (Coriander Seeds)",
        description:
          "Whole coriander seeds — roast and grind fresh for curries.",
        variants: [
          { size: "100 g", priceInPaise: rupees(30), stockQuantity: 25 },
          { size: "200 g", priceInPaise: rupees(55), stockQuantity: 12 },
        ],
      },
      {
        slug: "jeera",
        name: "Jeera (Cumin Seeds)",
        description: "Whole cumin seeds for tadka.",
        variants: [
          { size: "100 g", priceInPaise: rupees(45), stockQuantity: 25 },
          { size: "250 g", priceInPaise: rupees(105), stockQuantity: 10 },
        ],
      },
      {
        slug: "sunflower-oil",
        name: "Refined Sunflower Oil",
        description: "Light refined oil for everyday cooking.",
        variants: [
          { size: "1 L", priceInPaise: rupees(150), stockQuantity: 20 },
          { size: "5 L", priceInPaise: rupees(720), stockQuantity: 4 },
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
        variants: [
          {
            size: "500 ml",
            priceInPaise: rupees(28),
            mrpInPaise: rupees(28),
            stockQuantity: 40,
            lowStockThreshold: 10,
          },
        ],
      },
      {
        slug: "brown-bread",
        name: "Brown Bread",
        description: "Soft whole-wheat sandwich loaf.",
        variants: [
          {
            size: "400 g",
            priceInPaise: rupees(45),
            mrpInPaise: rupees(50),
            stockQuantity: 8,
          },
        ],
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
      {
        slug: "paneer",
        name: "Fresh Paneer",
        description: "Soft malai paneer block.",
        variants: [
          { size: "200 g", priceInPaise: rupees(90), stockQuantity: 10 },
        ],
      },
      {
        slug: "curd",
        name: "Fresh Curd",
        description: "Thick set dahi.",
        variants: [
          { size: "400 g", priceInPaise: rupees(40), stockQuantity: 15 },
          { size: "1 kg", priceInPaise: rupees(90), stockQuantity: 6 },
        ],
      },
      {
        slug: "butter",
        name: "Table Butter",
        description: "Salted butter for toast and parathas.",
        variants: [
          { size: "100 g", priceInPaise: rupees(58), stockQuantity: 15 },
          { size: "500 g", priceInPaise: rupees(285), stockQuantity: 5 },
        ],
      },
      {
        slug: "cheese-block",
        name: "Processed Cheese Block",
        description: "Processed cheese block for sandwiches, pizza and toast.",
        variants: [
          { size: "200 g", priceInPaise: rupees(130), stockQuantity: 8 },
        ],
      },
      {
        slug: "pav",
        name: "Pav",
        description: "Soft ladi pav for pav bhaji and vada pav.",
        variants: [
          { size: "Pack of 6", priceInPaise: rupees(30), stockQuantity: 12 },
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
          {
            size: "250 g",
            priceInPaise: rupees(25),
            mrpInPaise: rupees(25),
            stockQuantity: 50,
          },
          {
            size: "800 g",
            priceInPaise: rupees(80),
            mrpInPaise: rupees(85),
            stockQuantity: 12,
          },
        ],
      },
      {
        slug: "aloo-bhujia",
        name: "Aloo Bhujia",
        brand: "Haldiram's",
        description: "Crispy spiced potato namkeen.",
        variants: [
          {
            size: "200 g",
            priceInPaise: rupees(55),
            mrpInPaise: rupees(60),
            stockQuantity: 25,
          },
          {
            size: "400 g",
            priceInPaise: rupees(105),
            mrpInPaise: rupees(115),
            stockQuantity: 10,
          },
        ],
      },
      {
        slug: "instant-noodles",
        name: "Masala Instant Noodles",
        brand: "Maggi",
        description: "Two-minute masala noodles.",
        variants: [
          {
            size: "70 g",
            priceInPaise: rupees(14),
            mrpInPaise: rupees(14),
            stockQuantity: 60,
            lowStockThreshold: 12,
          },
          {
            size: "Pack of 4",
            priceInPaise: rupees(54),
            mrpInPaise: rupees(56),
            stockQuantity: 15,
          },
        ],
      },
      {
        slug: "potato-chips",
        name: "Salted Potato Chips",
        description: "Classic crisp salted chips.",
        variants: [
          { size: "50 g", priceInPaise: rupees(20), stockQuantity: 40 },
          { size: "150 g", priceInPaise: rupees(50), stockQuantity: 15 },
        ],
      },
      {
        slug: "roasted-peanuts",
        name: "Roasted Peanuts",
        description: "Crunchy roasted and salted peanuts.",
        variants: [
          { size: "200 g", priceInPaise: rupees(45), stockQuantity: 20 },
          { size: "500 g", priceInPaise: rupees(105), stockQuantity: 8 },
        ],
      },
      {
        slug: "cornflakes",
        name: "Cornflakes",
        description: "Crisp breakfast flakes.",
        variants: [
          { size: "475 g", priceInPaise: rupees(185), stockQuantity: 8 },
        ],
      },
      {
        slug: "rusk",
        name: "Toast Rusk",
        description: "Crisp elaichi rusk for chai time.",
        variants: [
          { size: "300 g", priceInPaise: rupees(45), stockQuantity: 20 },
        ],
      },
      {
        slug: "tomato-ketchup",
        name: "Tomato Ketchup",
        description: "Tangy tomato ketchup.",
        variants: [
          { size: "500 g", priceInPaise: rupees(110), stockQuantity: 12 },
          { size: "1 kg", priceInPaise: rupees(195), stockQuantity: 5 },
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
          {
            size: "250 g",
            priceInPaise: rupees(135),
            mrpInPaise: rupees(150),
            stockQuantity: 18,
          },
          {
            size: "500 g",
            priceInPaise: rupees(265),
            mrpInPaise: rupees(290),
            stockQuantity: 9,
          },
        ],
      },
      {
        slug: "instant-coffee",
        name: "Instant Coffee",
        brand: "Nescafé",
        description: "Classic instant coffee jar.",
        variants: [
          {
            size: "50 g",
            priceInPaise: rupees(180),
            mrpInPaise: rupees(195),
            stockQuantity: 7,
          },
        ],
      },
      {
        slug: "green-tea",
        name: "Green Tea Bags",
        description: "Light green tea, 25 bags.",
        variants: [
          { size: "25 bags", priceInPaise: rupees(150), stockQuantity: 10 },
        ],
      },
      {
        slug: "orange-juice",
        name: "Orange Juice",
        description: "Chilled orange fruit drink.",
        variants: [
          { size: "1 L", priceInPaise: rupees(110), stockQuantity: 10 },
        ],
      },
      {
        slug: "mango-drink",
        name: "Mango Drink",
        description: "Sweet mango fruit drink.",
        variants: [
          { size: "600 ml", priceInPaise: rupees(40), stockQuantity: 20 },
          { size: "1.2 L", priceInPaise: rupees(75), stockQuantity: 10 },
        ],
      },
      {
        slug: "cola",
        name: "Cola Soft Drink",
        description: "Fizzy cola, best served chilled.",
        variants: [
          { size: "750 ml", priceInPaise: rupees(40), stockQuantity: 24 },
          { size: "2 L", priceInPaise: rupees(95), stockQuantity: 8 },
        ],
      },
      {
        slug: "coconut-water",
        name: "Coconut Water",
        description: "Natural tender coconut water.",
        variants: [
          { size: "200 ml", priceInPaise: rupees(40), stockQuantity: 15 },
        ],
      },
      {
        slug: "chocolate-malt-drink",
        name: "Chocolate Malt Drink",
        description: "Chocolate health drink powder to mix with milk.",
        variants: [
          { size: "500 g", priceInPaise: rupees(245), stockQuantity: 8 },
        ],
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
          {
            size: "100 g",
            priceInPaise: rupees(38),
            mrpInPaise: rupees(40),
            stockQuantity: 30,
          },
          {
            size: "Pack of 4",
            priceInPaise: rupees(140),
            mrpInPaise: rupees(160),
            stockQuantity: 10,
          },
        ],
      },
      {
        slug: "toothpaste",
        name: "Toothpaste",
        brand: "Colgate",
        description: "Cavity-protection toothpaste.",
        variants: [
          {
            size: "200 g",
            priceInPaise: rupees(110),
            mrpInPaise: rupees(122),
            stockQuantity: 14,
          },
        ],
      },
      {
        slug: "coconut-hair-oil",
        name: "Coconut Hair Oil",
        brand: "Parachute",
        description: "Pure coconut oil.",
        variants: [
          {
            size: "200 ml",
            priceInPaise: rupees(98),
            mrpInPaise: rupees(105),
            stockQuantity: 2,
          },
        ],
      },
      {
        slug: "shampoo",
        name: "Shampoo",
        description: "Everyday shampoo for soft, clean hair.",
        variants: [
          { size: "180 ml", priceInPaise: rupees(150), stockQuantity: 12 },
          { size: "340 ml", priceInPaise: rupees(260), stockQuantity: 6 },
        ],
      },
      {
        slug: "hand-wash",
        name: "Hand Wash",
        description: "Liquid hand wash, pump bottle.",
        variants: [
          { size: "200 ml", priceInPaise: rupees(99), stockQuantity: 12 },
        ],
      },
      {
        slug: "toothbrush",
        name: "Toothbrush",
        description: "Soft-bristle toothbrush.",
        variants: [
          { size: "Single", priceInPaise: rupees(30), stockQuantity: 30 },
          { size: "Pack of 3", priceInPaise: rupees(80), stockQuantity: 10 },
        ],
      },
      {
        slug: "talcum-powder",
        name: "Talcum Powder",
        description: "Cooling talc for hot days.",
        variants: [
          { size: "100 g", priceInPaise: rupees(75), stockQuantity: 12 },
          { size: "300 g", priceInPaise: rupees(185), stockQuantity: 5 },
        ],
      },
      {
        slug: "body-lotion",
        name: "Body Lotion",
        description: "Moisturising lotion for dry skin.",
        variants: [
          { size: "200 ml", priceInPaise: rupees(180), stockQuantity: 8 },
        ],
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
          {
            size: "1 kg",
            priceInPaise: rupees(135),
            mrpInPaise: rupees(150),
            stockQuantity: 16,
          },
          {
            size: "3 kg",
            priceInPaise: rupees(390),
            mrpInPaise: rupees(430),
            stockQuantity: 0,
          },
        ],
      },
      {
        slug: "dishwash-bar",
        name: "Dishwash Bar",
        brand: "Vim",
        description: "Lemon dishwash bar.",
        variants: [
          {
            size: "300 g",
            priceInPaise: rupees(30),
            mrpInPaise: rupees(32),
            stockQuantity: 25,
          },
        ],
      },
      {
        slug: "floor-cleaner",
        name: "Floor Cleaner",
        description: "Disinfectant floor cleaner.",
        variants: [
          { size: "500 ml", priceInPaise: rupees(99), stockQuantity: 12 },
          { size: "1 L", priceInPaise: rupees(185), stockQuantity: 6 },
        ],
      },
      {
        slug: "toilet-cleaner",
        name: "Toilet Cleaner",
        description: "Thick liquid toilet cleaner.",
        variants: [
          { size: "500 ml", priceInPaise: rupees(95), stockQuantity: 12 },
          { size: "1 L", priceInPaise: rupees(175), stockQuantity: 6 },
        ],
      },
      {
        slug: "dishwash-liquid",
        name: "Dishwash Liquid",
        description: "Lemon dishwash gel.",
        variants: [
          { size: "500 ml", priceInPaise: rupees(110), stockQuantity: 12 },
        ],
      },
      {
        slug: "scrub-pads",
        name: "Scrub Pads",
        description: "Sponge-backed scrub pads for utensils.",
        variants: [
          { size: "Pack of 3", priceInPaise: rupees(45), stockQuantity: 20 },
        ],
      },
      {
        slug: "garbage-bags",
        name: "Garbage Bags",
        description: "Medium bin bags, 30 bags per roll.",
        variants: [
          { size: "1 roll", priceInPaise: rupees(90), stockQuantity: 15 },
        ],
      },
      {
        slug: "aa-batteries",
        name: "AA Batteries",
        description: "Long-life AA batteries.",
        variants: [
          { size: "Pack of 2", priceInPaise: rupees(40), stockQuantity: 20 },
          { size: "Pack of 4", priceInPaise: rupees(75), stockQuantity: 10 },
        ],
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
        variants: [
          {
            size: "Pack of 100",
            priceInPaise: rupees(60),
            mrpInPaise: rupees(65),
            stockQuantity: 20,
          },
        ],
      },
      {
        slug: "camphor-tablets",
        name: "Camphor Tablets",
        description: "Pure kapoor tablets for aarti.",
        variants: [
          { size: "50 g", priceInPaise: rupees(45), stockQuantity: 15 },
        ],
      },
      {
        slug: "clay-diya",
        name: "Clay Diya",
        description: "Handmade earthen diyas.",
        variants: [
          { size: "Pack of 12", priceInPaise: rupees(60), stockQuantity: 20 },
        ],
      },
      {
        slug: "cotton-wicks",
        name: "Cotton Wicks",
        description: "Round cotton batti for diyas.",
        variants: [
          { size: "Pack of 100", priceInPaise: rupees(30), stockQuantity: 25 },
        ],
      },
      {
        slug: "dhoop-cones",
        name: "Dhoop Cones",
        description: "Fragrant dhoop cones with stand.",
        variants: [
          { size: "Pack of 20", priceInPaise: rupees(50), stockQuantity: 15 },
        ],
      },
      {
        slug: "kalava",
        name: "Kalava (Mauli)",
        description: "Red-and-yellow sacred thread.",
        variants: [
          { size: "1 roll", priceInPaise: rupees(20), stockQuantity: 30 },
        ],
      },
      {
        slug: "kumkum",
        name: "Kumkum",
        description: "Red kumkum for tilak and pooja.",
        variants: [
          { size: "50 g", priceInPaise: rupees(25), stockQuantity: 25 },
        ],
      },
      {
        slug: "pooja-coconut",
        name: "Pooja Coconut",
        description: "Whole coconut for pooja and offerings.",
        variants: [
          { size: "1 pc", priceInPaise: rupees(40), stockQuantity: 15 },
        ],
      },
    ],
  },
  {
    slug: "bags",
    name: "Bags",
    products: [
      {
        slug: "school-backpack",
        name: "School Backpack",
        description: "Roomy school bag with padded straps.",
        variants: [
          { size: "Standard", priceInPaise: rupees(499), stockQuantity: 6 },
        ],
      },
      {
        slug: "jute-shopping-bag",
        name: "Jute Shopping Bag",
        description: "Strong reusable jute bag for groceries.",
        variants: [
          { size: "Medium", priceInPaise: rupees(99), stockQuantity: 15 },
          { size: "Large", priceInPaise: rupees(149), stockQuantity: 10 },
        ],
      },
      {
        slug: "cotton-tote-bag",
        name: "Cotton Tote Bag",
        description: "Plain canvas tote for everyday use.",
        variants: [
          { size: "Standard", priceInPaise: rupees(129), stockQuantity: 12 },
        ],
      },
      {
        slug: "ladies-handbag",
        name: "Ladies Handbag",
        description: "Faux-leather handbag with zip pockets.",
        variants: [
          { size: "Standard", priceInPaise: rupees(699), stockQuantity: 4 },
        ],
      },
      {
        slug: "travel-duffel-bag",
        name: "Travel Duffel Bag",
        description: "Spacious duffel for short trips.",
        variants: [
          { size: "Standard", priceInPaise: rupees(899), stockQuantity: 3 },
        ],
      },
      {
        slug: "laptop-backpack",
        name: "Laptop Backpack",
        description: "Padded backpack for laptops up to 15.6 inch.",
        variants: [
          { size: "Standard", priceInPaise: rupees(999), stockQuantity: 4 },
        ],
      },
      {
        slug: "sling-bag",
        name: "Sling Bag",
        description: "Compact crossbody bag for phone and wallet.",
        variants: [
          { size: "Standard", priceInPaise: rupees(349), stockQuantity: 6 },
        ],
      },
      {
        slug: "lunch-bag",
        name: "Insulated Lunch Bag",
        description: "Keeps tiffin warm, fits two boxes.",
        variants: [
          { size: "Standard", priceInPaise: rupees(249), stockQuantity: 8 },
        ],
      },
    ],
  },
];

/** add-only: fills in a missing photo on an existing product, else
 * creates the product. Returns false when the product already existed. */
async function addProductIfMissing(
  categoryId: string,
  params: ProductSeed,
): Promise<boolean> {
  const existing = await db.product.findUnique({
    where: { slug: params.slug },
    select: { id: true, imageUrl: true },
  });
  if (existing) {
    const imageUrl = photoFor(params);
    if (!existing.imageUrl && imageUrl) {
      await db.product.update({
        where: { id: existing.id },
        data: { imageUrl },
      });
    }
    return false;
  }
  await upsertProduct(categoryId, params);
  return true;
}

async function upsertProduct(categoryId: string, params: ProductSeed) {
  const product = await db.product.upsert({
    where: { slug: params.slug },
    create: {
      slug: params.slug,
      name: params.name,
      brand: params.brand ?? null,
      description: params.description,
      imageUrl: photoFor(params),
      categoryId,
      isDemo: true,
    },
    update: {
      name: params.name,
      brand: params.brand ?? null,
      description: params.description,
      imageUrl: photoFor(params),
      categoryId,
    },
  });

  for (const [index, variant] of params.variants.entries()) {
    if (
      variant.mrpInPaise !== undefined &&
      variant.priceInPaise > variant.mrpInPaise
    ) {
      throw new Error(
        `Seed error: ${params.slug} ${variant.size} is priced above its MRP.`,
      );
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
      update: ADD_ONLY ? {} : { name: categorySeed.name },
    });

    for (const productSeed of categorySeed.products) {
      if (ADD_ONLY) {
        if (await addProductIfMissing(category.id, productSeed))
          productCount += 1;
      } else {
        await upsertProduct(category.id, productSeed);
        productCount += 1;
      }
    }
  }

  console.log(ADD_ONLY ? "Add-only seed complete." : "Seed complete.");
  console.log(
    `  Categories: ${CATALOG.length}, demo products ${ADD_ONLY ? "added" : "seeded"}: ${productCount}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
