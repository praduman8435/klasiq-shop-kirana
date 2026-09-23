import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminSession } from "@/lib/admin/session";
import { ADMIN_BRAND_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: { default: ADMIN_BRAND_NAME, template: `%s | ${ADMIN_BRAND_NAME}` },
  robots: { index: false, follow: false },
};

/**
 * The server-side gate for every /admin/* route except /admin/login. This
 * is the enforcement point for page views — every mutating Server Action
 * additionally re-checks getAdminSession() itself (see
 * docs/PHASE_3_REPORT.md "Security review"), since a client that already
 * has an action reference could otherwise call it directly after this
 * layout last rendered.
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminShell adminName={admin.name}>{children}</AdminShell>;
}
