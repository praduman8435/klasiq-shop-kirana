import { z } from "zod";

// Free-text query for Geoapify autocomplete — deliberately permissive (no
// minimum beyond non-empty; the client already waits for a few characters
// before calling, see src/components/checkout/delivery-address-search.tsx).
export const deliveryAddressSearchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

// A single selected/geocoded location to preview the delivery fee for.
// These coordinates are never trusted as the final word on distance (the
// server recalculates the route again at order placement — see
// place-order.ts) but must be plausible before a preview is even attempted.
export const deliveryFeePreviewSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
