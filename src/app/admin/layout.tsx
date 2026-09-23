/**
 * Phase 3.7 Part 7 (final visual direction) — the customer storefront's
 * redesign replaced the root `:root` design tokens in globals.css (that
 * stylesheet is shared by the whole app, storefront and admin alike).
 * This layout exists SOLELY to apply `.admin-theme`, which restores every
 * one of those tokens to its exact pre-redesign value, to every admin
 * route (`/admin/login`, everything under `(protected)`, and the
 * standalone `/admin/orders/[orderNumber]/invoice`) — so the admin panel
 * remains pixel-identical to before this part, as required. No admin
 * page, component, or Server Action changes; this is the only change
 * admin needed as a consequence of the storefront's token redesign.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-theme flex min-h-full flex-1 flex-col">{children}</div>;
}
