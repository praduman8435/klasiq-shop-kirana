/**
 * Centralized brand/site identity. Nothing else in the codebase should
 * hard-code the brand name, tagline, or heritage copy — import from here so
 * a future rename or copy change happens in one place, not scattered across
 * components. See docs/PHASE_3_REPORT.md ("Branding") for the rename from
 * the Phase 1/2 placeholder name to Klasiq.
 */
export const BRAND = {
  /** Normal running-text presentation: "Klasiq". */
  name: "Klasiq",
  /** All-caps wordmark/logo treatment — visual only, never used as the
   * textual brand name in copy. */
  wordmark: "KLASIQ",
  /** Plays on the brand name itself (Klasiq/"classic") — deliberately
   * category-neutral, so it holds as the kirana catalog grows. */
  tagline: "Classic quality, modern shopping.",
  /** The homepage's lead line — what the store sells and why it's
   * different from an app warehouse: the shop down the road. */
  heroHeadline: "All your daily essentials, from the store next door.",
  description:
    "Atta, dal, oil, masale, snacks and everyday household essentials from your neighbourhood store — order online for pickup or home delivery.",
  /** Deliberately vague on an exact founding year — see PHASE_3_REPORT.md
   * "Heritage claims". Update only when a specific founding year is
   * explicitly confirmed for production copy. */
  heritageLine: "Serving local families for around 30 years.",
  /** The physical retail businesses Klasiq's catalog and fulfillment are
   * backed by. Referenced sparingly (About/footer/trust areas), never as
   * the primary brand on every screen. */
  legacyStoreNames: ["Milan Readymade & General Store", "Shubham Vashtralaya"] as const,
} as const;

export const ADMIN_BRAND_NAME = `${BRAND.name} Admin`;

/**
 * Confirmed, authoritative customer-facing store contact info — surfaced
 * on Store Pickup instructions, order confirmation/detail, the footer,
 * and error-page recovery copy. Never invent a different phone number or
 * Maps destination; `mapsUrl` is the one authoritative "where is the
 * store" link across the whole app.
 */
export const STORE_CONTACT = {
  phone: "8542843482",
  phoneHref: "tel:8542843482",
  mapsUrl: "https://maps.app.goo.gl/gz4n7NiTXV6Yw3G4A",
} as const;

/** "Backed by X and Y" — built from legacyStoreNames so the wording only
 * needs to change in one place if the backing stores ever change. */
export function getBackedByLine(): string {
  const [first, second] = BRAND.legacyStoreNames;
  return `Backed by ${first} and ${second}`;
}
