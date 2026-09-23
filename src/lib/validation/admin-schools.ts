import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const schoolFormSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  slug: z
    .string()
    .trim()
    .min(2, "Slug is required.")
    .max(80)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens only (e.g. abc-public-school)."),
  city: z.string().trim().max(80).optional(),
  logoUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
  isActive: z.boolean(),
  isVerifiedPartner: z.boolean(),
});

export const createSchoolSchema = schoolFormSchema;
export const updateSchoolSchema = schoolFormSchema.extend({ id: z.string().min(1) });

export const createSchoolClassSchema = z.object({
  schoolId: z.string().min(1),
  name: z.string().trim().min(1, "Class name is required.").max(60),
});
export const deleteSchoolClassSchema = z.object({ id: z.string().min(1) });

export const GENDER_VALUES = ["BOYS", "GIRLS", "UNISEX"] as const;

export const createAssignmentSchema = z.object({
  schoolId: z.string().min(1),
  classId: z.string().min(1).nullable(),
  gender: z.enum(GENDER_VALUES),
  productId: z.string().min(1),
});
export const deleteAssignmentSchema = z.object({ id: z.string().min(1) });

export const recommendedSetFormSchema = z.object({
  schoolId: z.string().min(1),
  classId: z.string().min(1).nullable(),
  gender: z.enum(GENDER_VALUES),
  name: z.string().trim().min(2, "Name is required.").max(120),
  description: z.string().trim().max(300).optional(),
});
export const createRecommendedSetSchema = recommendedSetFormSchema;
export const deleteRecommendedSetSchema = z.object({ id: z.string().min(1) });

export const addSetItemSchema = z.object({
  setId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(20),
});
export const removeSetItemSchema = z.object({ id: z.string().min(1) });
