import { Phone, MapPin, PackageSearch } from "lucide-react";
import { TrackOrdersLink } from "@/components/site/track-orders-link";
import { BRAND, STORE_CONTACT, getBackedByLine } from "@/lib/constants";

const HELP_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-2.5 rounded-lg text-sm font-semibold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring";

const ICON_TILE_CLASS = "flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand-deep";

/**
 * A quiet close: the store's name and line, and the three things people
 * actually need from a footer — call, directions, track an order. Contact
 * details come only from `STORE_CONTACT` (the one authoritative source).
 * Search lives in the sticky header, so it isn't repeated here.
 */
export function SiteFooter({ storeName }: { storeName: string }) {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-[1.4fr_1fr] sm:px-6 sm:py-10">
        <div>
          <p className="text-xl font-black leading-none">
            {BRAND.wordmark}
            <span className="text-primary">.</span>
          </p>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{BRAND.description}</p>
          <p className="mt-2 max-w-sm text-xs text-muted-foreground">{getBackedByLine()}</p>
        </div>

        <ul className="flex flex-col">
          <li>
            <a
              href={STORE_CONTACT.phoneHref}
              aria-label={`Call ${storeName} at ${STORE_CONTACT.phone}`}
              className={HELP_LINK_CLASS}
            >
              <span className={ICON_TILE_CLASS}>
                <Phone className="size-4" aria-hidden />
              </span>
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
              <span className={ICON_TILE_CLASS}>
                <MapPin className="size-4" aria-hidden />
              </span>
              Get directions
            </a>
          </li>
          <li>
            <TrackOrdersLink className={HELP_LINK_CLASS} activeClassName="text-primary" iconClassName="hidden">
              <span className={ICON_TILE_CLASS}>
                <PackageSearch className="size-4" aria-hidden />
              </span>
              Track an order
            </TrackOrdersLink>
          </li>
        </ul>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} {storeName}. All rights reserved.
      </p>
    </footer>
  );
}
