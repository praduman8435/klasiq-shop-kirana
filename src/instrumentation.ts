/**
 * Pre-deployment hardening — "the app should refuse to start if a
 * critical variable is not set." `register()` runs once when a new
 * Next.js server instance starts, and MUST complete before the server
 * accepts any request (see node_modules/next/dist/docs .../instrumentation.md)
 * — the correct, idiomatic place for a fail-fast startup check in this
 * Next.js version, rather than only discovering a missing variable on
 * the first real request.
 *
 * This does not replace the existing, narrower checks each module already
 * performs at first use (`getWhatsAppTransportConfig`, `getOtpProvider`,
 * Prisma's own `DATABASE_URL` resolution) — those remain as defense in
 * depth. This is strictly an EAGER, startup-time superset of "is this
 * present at all," never a duplicate of their own shape/business-rule
 * validation.
 */
export async function register() {
  // Only the Node.js runtime actually boots this server process; the
  // Edge runtime (middleware, if this project ever adds any) has no
  // equivalent "server startup" moment and no access to these variables
  // regardless.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const missing: string[] = [];

  // Always required — nothing in this app functions without a database.
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");

  // Required in production specifically: getOtpProvider() (src/server/otp/provider.ts)
  // always selects the real WhatsApp-backed provider when NODE_ENV=production,
  // with no console fallback — Customer Portal login (OTP) and every
  // order/return/invoice WhatsApp notification would be unable to send at
  // all without these. Optional outside production, where the console
  // stand-ins cover local development with zero configuration.
  // WhatsApp is optional: a store can go live before its WhatsApp
  // Business API is set up. Without it, order messages are skipped and
  // phone-OTP order tracking asks the customer to call the store instead.
  if (process.env.NODE_ENV === "production") {
    const whatsappMissing = ["WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_OTP_TEMPLATE_NAME"].filter(
      (name) => !process.env[name],
    );
    if (whatsappMissing.length > 0) {
      console.warn(
        `Klasiq startup notice: WhatsApp is not configured (missing ${whatsappMissing.join(", ")}). ` +
          "Order messages are disabled and Track Orders will ask customers to call the store.",
      );
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Klasiq cannot start: missing required environment variable(s): ${missing.join(", ")}. ` +
        "See .env.example for what each one is and where to get it.",
    );
  }

  // Soft warning, never a startup failure: TLS query-parameter
  // conventions genuinely differ across managed Postgres providers
  // (`sslmode=require`, `ssl=true`, a provider-specific pgbouncer setup
  // that terminates TLS elsewhere, etc.) — a hard fail here would risk
  // false-positive-blocking a legitimately secure production deployment
  // this heuristic just doesn't recognize. This only exists to catch the
  // common, genuine mistake of pointing production at a connection
  // string with no TLS indicator at all.
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL.toLowerCase();
    const looksLocal = url.includes("localhost") || url.includes("127.0.0.1");
    const mentionsSsl = url.includes("sslmode=") || url.includes("ssl=true") || url.includes("ssl=1");
    if (!looksLocal && !mentionsSsl) {
      console.warn(
        "Klasiq startup warning: DATABASE_URL does not appear to request TLS " +
          "(no sslmode=/ssl= query parameter found). If this is a real production " +
          "database, confirm your provider's connection is encrypted — see .env.example.",
      );
    }
  }
}
