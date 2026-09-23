import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-portal/session";

/**
 * The server-side gate for every protected /track/* route — mirrors
 * /admin/(protected)/layout.tsx's role exactly, for the customer-portal
 * security domain instead of admin. Every mutating Server Action under
 * this tree must additionally re-check `getCustomerSession()` itself (a
 * client already holding an action reference could otherwise call it
 * directly after this layout last rendered) — see
 * docs/PHASE_3_4_REPORT.md "Authorization helper".
 */
export default async function ProtectedTrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCustomerSession();
  if (!session) {
    redirect("/track");
  }

  return <>{children}</>;
}
