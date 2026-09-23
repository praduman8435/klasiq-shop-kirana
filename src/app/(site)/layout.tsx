import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { RouteThemeScope } from "@/components/site/route-theme-scope";
import { BRAND } from "@/lib/constants";

/**
 * Phase 3.7 Part 7 (homepage redesign) — wraps the whole storefront tree
 * in ONE `RouteThemeScope`, rather than scoping the header/footer/page
 * body separately. A single scope guarantees an opaque `bg-background`
 * fill directly behind everything (including translucent surfaces like
 * the footer's `bg-secondary/40`) whenever the homepage's `.dark` theme
 * is active — three independent scopes left translucent children
 * blending against the true (light) `<body>` background peeking through
 * the gaps between them, which read as washed-out grey instead of dark.
 */
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RouteThemeScope as="div" className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <SiteHeader storeName={BRAND.name} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter storeName={BRAND.name} />
    </RouteThemeScope>
  );
}
