import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").toLowerCase(),
  password: z.string().min(1, "Password is required."),
});
