import { Phone, MapPin } from "lucide-react";
import { SiteSearch } from "@/components/site/site-search";
import { TrackOrdersLink } from "@/components/site/track-orders-link";
import { BRAND, STORE_CONTACT, getBackedByLine } from "@/lib/constants";

const HELP_LINK_CLASS =
  "inline-flex min-h-10 items-center gap-1.5 text-sm font-medium underline-offset-2 transition-colors hover:underline";

/**
 * The pack's back panel: the "Marketed by" block and the customer-care
 * box every Indian pack prints, ruled into three cells. Contact details
 * come only from `STORE_CONTACT` (the one authoritative source), and the
 * search box/Track Order link reuse the header's own components.
 */
export function SiteFooter({ storeName }: { storeName: string }) {
  return (
    <footer className="border-t border-foreground bg-card">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid border border-foreground sm:grid-cols-3 [&>div]:p-4 sm:[&>div]:p-5 [&>div+div]:border-t [&>div+div]:border-foreground sm:[&>div+div]:border-l sm:[&>div+div]:border-t-0">
          <div>
            <p className="font-condensed text-2xl font-extrabold leading-none">{BRAND.wordmark}</p>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{BRAND.description}</p>
            <p className="mt-2 max-w-xs text-xs text-muted-foreground">{getBackedByLine()}</p>
          </div>

          <div>
            <p className="decl-label text-muted-foreground">Customer care</p>
            <ul className="mt-2 flex flex-col">
              <li>
                <a
                  href={STORE_CONTACT.phoneHref}
                  aria-label={`Call ${storeName} at ${STORE_CONTACT.phone}`}
                  className={HELP_LINK_CLASS}
                >
                  <Phone className="size-4 shrink-0" aria-hidden />
                  <span className="tabular-nums">{STORE_CONTACT.phone}</span>
                </a>
              </li>
              <li>
                <a
                  href={STORE_CONTACT.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Get directions to ${storeName} (opens in a new tab)`}
                  className={HELP_LINK_CLASS}
                >
                  <MapPin className="size-4 shrink-0" aria-hidden />
                  Get directions
                </a>
              </li>
              <li>
                <TrackOrdersLink className={HELP_LINK_CLASS} activeClassName="underline">
                  Track an order
                </TrackOrdersLink>
              </li>
            </ul>
          </div>

          <div>
            <p className="max-w-xs text-sm font-semibold">Search by product or brand</p>
            <SiteSearch size="compact" className="mt-3 max-w-xs" />
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {storeName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
