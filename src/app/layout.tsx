import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/constants";
import { SITE_URL } from "@/lib/site-config";
import "./globals.css";

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const headingFont = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} | ${BRAND.tagline}`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fdfbf7",
};

/**
 * Deliberately minimal: fonts, global styles, and the toast host only.
 * Public storefront chrome (header/footer/search/bag) lives in
 * `(site)/layout.tsx`; the admin surface has its own shell in
 * `admin/(protected)/layout.tsx`. Neither should leak into the other —
 * see docs/PHASE_3_REPORT.md "Admin architecture".
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${headingFont.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        {/* PDP redesign critique fix — the Product Detail page's mobile
            sticky purchase bar (`product-detail.tsx`) sits in the same
            bottom-center real estate Sonner defaults into, so a toast
            fired right after tapping Add to Bag would render on top of
            it. `mobileOffset` lifts toasts clear of that bar's height
            (~69px) plus its safe-area padding on every page — harmless
            on pages without a sticky bar (toasts just sit a little
            higher off the edge), and it means this doesn't need to be
            threaded per-route. */}
        <Toaster position="bottom-center" mobileOffset={{ bottom: "88px" }} />
      </body>
    </html>
  );
}
