import type { NextConfig } from "next";

// Pre-deployment hardening — security headers, applied via `headers()`
// (the idiomatic Next.js mechanism; there is no Express/helmet in this
// app). No nonce-based CSP: that requires a `proxy.ts` running on every
// request and forces every page into dynamic rendering
// (node_modules/next/dist/docs/.../content-security-policy.md "Dynamic
// Rendering Requirement") — real cost for an app with zero third-party
// scripts and zero user-generated content that could inject one. The
// simpler, static policy this same doc recommends for that case is what's
// below.
//
// Phase 3.7 Part 1 — CRITICAL FIX: `script-src` was previously missing
// `'unsafe-inline'` entirely. That doesn't just narrow the policy — the
// doc's own "Without Nonces" recipe requires `'unsafe-inline'` on
// script-src for exactly this reason: Next.js always emits inline
// `<script>` tags for its hydration bootstrap and RSC streaming payload,
// regardless of whether the app has any third-party scripts of its own.
// Without it, EVERY client component fails to hydrate in production —
// verified live: a real browser against `next start` couldn't open the
// mobile nav sheet, add an item to the bag, or run any client-side
// interaction at all, and the console was full of
// "Executing inline script violates ... 'script-src 'self''" errors.
// `next build`/`tsc`/the Vitest suite all stayed green throughout because
// none of them load the app in a real browser with these headers
// enforced — this was only caught by Phase 3.7 Part 1's mandated
// real end-to-end browser journey. `'unsafe-inline'` does mean an
// attacker who found a way to inject a `<script>` tag could run it; the
// original reasoning for skipping nonces (zero third-party scripts, zero
// user-generated content, so there's no untrusted-content injection
// surface to exploit in the first place) is exactly the same reasoning
// that makes this an acceptable, documented trade-off rather than a
// second bug — see docs/PHASE_3_7_REPORT.md.
//
// `'unsafe-eval'` is dev-only (React's own dev-mode error-stack
// reconstruction needs it — same doc, "neither React nor Next.js use
// eval in production by default"). `'unsafe-inline'` for styles matches
// the doc's own non-nonce baseline (Tailwind's compiled stylesheet is
// same-origin already; this only covers Next/React's own injected inline
// `style` attributes, not a third-party stylesheet).
const isDev = process.env.NODE_ENV === "development";
// Dev-only allowance so impeccable live mode can load.
const __impeccableLiveDev =
  process.env.NODE_ENV === "development" ? " http://localhost:8400" : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${__impeccableLiveDev}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${__impeccableLiveDev}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Phase 3.6.6 Part 2 — pdfkit reads its bundled Helvetica .afm font
  // metrics from disk relative to its own module directory at runtime
  // (fs.readFileSync(path.join(__dirname, ...))). Bundling it (the
  // Next.js default for Server Component/Route Handler dependencies)
  // rewrites that directory away from a real on-disk path, so the read
  // fails with ENOENT. Excluding it here makes Next `require()` it
  // natively instead, exactly like the many other filesystem/native-asset
  // packages (sharp, better-sqlite3, etc.) in Next's own default list.
  serverExternalPackages: ["pdfkit"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Superseded by CSP's frame-ancestors below in modern browsers
          // (Next's own docs note this) — kept too for older browsers.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // Only in production: HSTS over a plain-HTTP local dev origin
          // is meaningless and, in the worst case, a footgun (browsers
          // ignore it over http:// anyway, but there's no reason to send
          // it before this app is genuinely served over HTTPS).
          ...(isDev
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
