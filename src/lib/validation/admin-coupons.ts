import { z } from "zod";

const rupees = z.coerce.number().min(0, "Can't be negative.").max(1_00_000, "That amount looks too large.");
/** "YYYY-MM-DD" from a date input, or blank. */
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")]).optional();

export const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase())
      .pipe(z.string().min(3, "Code needs at least 3 letters or numbers.").max(20, "Keep the code under 20 characters.").regex(/^[A-Z0-9]+$/, "Use only letters and numbers.")),
    type: z.enum(["PERCENT", "FLAT", "FREE_DELIVERY"]),
    percent: z.coerce.number().int("Use a whole number.").min(0).max(100).optional(),
    flatInRupees: rupees.optional(),
    maxDiscountInRupees: rupees.nullable().optional(),
    minOrderInRupees: rupees.default(0),
    startsOn: day,
    expiresOn: day,
    usageLimit: z.coerce.number().int().min(1, "At least 1.").nullable().optional(),
    perCustomerLimit: z.coerce.number().int().min(1, "At least 1.").max(100).default(1),
    firstOrderOnly: z.boolean().default(false),
    showOnWebsite: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.type === "PERCENT" && !(v.percent && v.percent >= 1 && v.percent <= 100)) {
      ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter a percentage from 1 to 100." });
    }
    if (v.type === "FLAT" && !(v.flatInRupees && v.flatInRupees > 0)) {
      ctx.addIssue({ code: "custom", path: ["flatInRupees"], message: "Enter how many rupees off." });
    }
    if (v.type === "FLAT" && v.flatInRupees && v.minOrderInRupees && v.flatInRupees > v.minOrderInRupees) {
      ctx.addIssue({ code: "custom", path: ["flatInRupees"], message: "The discount can't be more than the minimum order." });
    }
    if (v.startsOn && v.expiresOn && v.expiresOn < v.startsOn) {
      ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "The last day can't be before the start day." });
    }
  });

export type CouponFormInput = z.input<typeof couponFormSchema>;

export const updateCouponSchema = z.object({ id: z.string().min(1) }).and(couponFormSchema);
export const setCouponActiveSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });
