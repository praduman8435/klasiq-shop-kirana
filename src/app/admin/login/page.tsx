import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/login-form";
import { getAdminSession } from "@/lib/admin/session";
import { ADMIN_BRAND_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const admin = await getAdminSession();
  if (admin) {
    redirect("/admin");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8 text-center">
        <p className="font-heading text-2xl font-semibold tracking-tight">
          {ADMIN_BRAND_NAME}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to manage schools, products and orders.
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <AdminLoginForm />
      </div>
    </div>
  );
}
