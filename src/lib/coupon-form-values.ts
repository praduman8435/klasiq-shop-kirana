/** The offer form's fields as the admin types them (strings for inputs).
 * Kept outside the client component so server pages can build defaults. */
export type CouponFormValues = {
  id?: string;
  code: string;
  type: "PERCENT" | "FLAT" | "FREE_DELIVERY";
  percent: string;
  flat: string;
  maxDiscount: string;
  minOrder: string;
  startsOn: string;
  expiresOn: string;
  usageLimit: string;
  perCustomerLimit: string;
  firstOrderOnly: boolean;
  showOnWebsite: boolean;
  isActive: boolean;
};

export const EMPTY_COUPON: CouponFormValues = {
  code: "",
  type: "FLAT",
  percent: "",
  flat: "",
  maxDiscount: "",
  minOrder: "",
  startsOn: "",
  expiresOn: "",
  usageLimit: "",
  perCustomerLimit: "1",
  firstOrderOnly: false,
  showOnWebsite: true,
  isActive: true,
};
