import Link from "next/link";
import { Phone, MapPin } from "lucide-react";
import { SchoolSearch } from "@/components/site/school-search";
import { TrackOrdersLink } from "@/components/site/track-orders-link";
import { BRAND, STORE_CONTACT, getBackedByLine } from "@/lib/constants";

const HELP_LINK_CLASS = "inline-flex items-center gap-1.5 transition-colors hover:text-foreground";

/**
 * Phase 3.7 Part 7 (homepage redesign) — the dark-first theme on "/" is
 * applied once, at the `(site)` layout level, so this component just
 * uses semantic tokens as always.
 *
 * Phase 3.8 — replaced the "Shop" category column (redundant with the
 * header nav one scroll away) with a "Need Help?" column, and gave
 * "Find your school" a genuinely working search box instead of a link
 * to "/" that did nothing when you were already there. Both the help
 * list's Track Order/Find Your School entries and the search box reuse
 * the exact same components/routes the header and homepage already use
 * (`TrackOrdersLink`, `SchoolSearch`) — no second implementation of
 * either.
 */
export function SiteFooter({ storeName }: { storeName: string }) {
  return (
    <footer className="border-t bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <p className="font-heading text-base font-semibold">{storeName}</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {BRAND.description}
            </p>
            <p className="mt-2 max-w-xs text-xs text-muted-foreground">
              {getBackedByLine()}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={STORE_CONTACT.phoneHref}
                aria-label={`Call ${storeName} at ${STORE_CONTACT.phone}`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                {STORE_CONTACT.phone}
              </a>
              <a
                href={STORE_CONTACT.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Get directions to ${storeName} (opens in a new tab)`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
                Get Directions
              </a>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Need Help?</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
              <li>
                <TrackOrdersLink className={HELP_LINK_CLASS} activeClassName="text-foreground font-medium">
                  Track Order
                </TrackOrdersLink>
              </li>
              <li>
                <a href={STORE_CONTACT.phoneHref} className={HELP_LINK_CLASS}>
                  Contact Us
                </a>
              </li>
              <li>
                <Link href="/" className={HELP_LINK_CLASS}>
                  Find Your School
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Find your school</p>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Find your school to see the products and pricing available for
              your school.
            </p>
            <SchoolSearch size="compact" className="mt-3 max-w-xs" />
          </div>
        </div>

        <p className="mt-10 border-t pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {storeName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
