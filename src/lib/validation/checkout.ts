import { z } from "zod";

// Loosely validates an Indian mobile number: optional +91/91 prefix, then a
// 10-digit number starting 6-9. Spaces/hyphens are stripped before testing.
// Shared as-is by customerMobile and whatsappPhone below — same format,
// same transform. This is checkout-input shape validation only; the actual
// customer-identity normalization/dedup key is src/lib/phone.ts's
// normalizePhoneNumber, called later by the commerce layer — see
// docs/PHASE_3_1_REPORT.md for why the two aren't merged.
const MOBILE_PATTERN = /^(?:\+?91)?[6-9]\d{9}$/;
const mobileNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .refine((value) => MOBILE_PATTERN.test(value), {
    message: "Please enter a valid 10-digit mobile number.",
  });

export const checkoutInputSchema = z
  .object({
    customerName: z.string().trim().min(2, "Please enter your name.").max(80),
    customerMobile: mobileNumberSchema,
    // `whatsappSameAsPrimary` (checkbox, defaults true client-side) decides
    // whether the commerce layer copies customerMobile or uses this field.
    // Omitted/empty is fine while checked; required (see superRefine below)
    // once unchecked — Phase 3.3 Part 3: leaving it blank after explicitly
    // saying "not the same" is an ambiguous state, not a valid signal.
    whatsappSameAsPrimary: z.boolean().default(true),
    whatsappPhone: z.union([mobileNumberSchema, z.literal("")]).optional(),
    fulfillmentType: z.enum(["STORE_PICKUP", "LOCAL_DELIVERY"]),
    // Delivery DETAILS (free text for the delivery person) — separate from
    // the geocoded destination below. deliveryArea is optional since the
    // Geoapify formatted address already carries locality/area/postcode.
    deliveryAddressLine: z.string().trim().max(160).optional(),
    deliveryArea: z.string().trim().max(80).optional(),
    deliveryLandmark: z.string().trim().max(120).optional(),
    // The AUTHORITATIVE selected Geoapify location — required for
    // LOCAL_DELIVERY. Coordinates are never trusted as the final word on
    // distance (the server recalculates the route itself at order
    // placement — see place-order.ts), but they must be present and
    // plausible before checkout can proceed at all.
    destinationLat: z.number().min(-90).max(90).optional(),
    destinationLon: z.number().min(-180).max(180).optional(),
    destinationFormattedAddress: z.string().trim().min(1).max(300).optional(),
    // What the customer's last delivery-fee preview showed — a staleness
    // comparison baseline only, NEVER the charged amount. See
    // docs/PHASE_3_3_REPORT.md Part 2 "Delivery quote consistency".
    expectedDeliveryFeeInPaise: z.number().int().min(0).optional(),
    // Client-generated once per checkout attempt (crypto.randomUUID()) and
    // resent unchanged on retry — see docs/PHASE_2_REPORT.md "Idempotency".
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    // Unchecking "same as primary" is an explicit statement that a
    // DIFFERENT number should be used — leaving it blank in that state is
    // an ambiguous, half-filled-in state (Phase 3.3 Part 3 audit), not a
    // valid "no WhatsApp" signal. Checked (the default) never requires
    // this field at all.
    if (data.whatsappSameAsPrimary === false && !data.whatsappPhone) {
      ctx.addIssue({
        code: "custom",
        path: ["whatsappPhone"],
        message: "Please enter a WhatsApp number, or check \"same as primary phone.\"",
      });
    }

    if (data.fulfillmentType !== "LOCAL_DELIVERY") return;

    if (!data.deliveryAddressLine || data.deliveryAddressLine.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveryAddressLine"],
        message: "Please enter your house/flat number and street.",
      });
    }
    if (
      data.destinationLat === undefined ||
      data.destinationLon === undefined ||
      !data.destinationFormattedAddress
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationFormattedAddress"],
        message: "Please search for and select your delivery location.",
      });
    }
    if (data.expectedDeliveryFeeInPaise === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedDeliveryFeeInPaise"],
        message: "Please wait for the delivery fee to be calculated.",
      });
    }
  });

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
