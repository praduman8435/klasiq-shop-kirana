"use client";

import { useState } from "react";
import { ProductPlaceholderImage } from "@/components/product/product-placeholder-image";
import { cn } from "@/lib/utils";

/**
 * Phase 3.7 Part 1 — `Product.imageUrl` has been fully wired through the
 * admin product form since Phase 3, but nothing customer-facing ever read
 * it: every product rendered the generic category-icon placeholder
 * regardless of whether a real photo was uploaded. This is the one shared
 * thumbnail every storefront surface (product card, bag line item,
 * checkout order summary) now goes through, so an uploaded photo shows up
 * everywhere consistently rather than looking "half-wired" in some spots.
 *
 * A plain `<img>`, not `next/image` — `imageUrl` is an admin-entered,
 * arbitrary external URL (validated only as `.url()`, no domain
 * allowlist), and `next/image` requires a configured `remotePatterns`
 * allowlist per host. Adding a wildcard allowlist just to support this
 * would be a bigger, unrelated config change; a plain `<img>` needs none
 * and degrades safely (see `onError` below).
 */
export function ProductThumbnail({
  imageUrl,
  alt,
  categorySlug,
  className,
  compact = false,
  large = false,
  packFront,
}: {
  imageUrl?: string | null;
  alt: string;
  categorySlug: string;
  className?: string;
  compact?: boolean;
  /** Use on the Product Detail page's much larger image slot — see
   * `ProductPlaceholderImage`'s own doc comment. */
  large?: boolean;
  /** When given, a missing photo renders as a pack-front panel (a large
   * category mark plus the selected net quantity) instead of the bare
   * icon. Only for the Product Detail image — the title beside it already
   * carries brand and name, so the panel never repeats them. */
  packFront?: { netQty: string | null };
}) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <ProductPlaceholderImage
        categorySlug={categorySlug}
        className={className}
        compact={compact}
        large={large}
        packFront={packFront}
      />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl bg-muted", className)}>
      <img
        // A server-rendered `<img>` can start (and, for a fast local 404,
        // finish) loading before React hydrates and attaches `onError`
        // below — the native `error` event doesn't bubble, so a failure
        // that happens in that window is otherwise missed forever,
        // permanently showing a broken-image glyph instead of the
        // fallback. This `ref` callback runs the moment React attaches to
        // the element (hydration or mount) and checks whether the browser
        // already gave up on it (`complete && naturalWidth === 0`),
        // catching exactly that race in addition to `onError` handling
        // any failure that happens afterward.
        ref={(node) => {
          if (node && node.complete && node.naturalWidth === 0) {
            setFailed(true);
          }
        }}
        src={imageUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </div>
  );
}
