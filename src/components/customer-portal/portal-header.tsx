import Link from "next/link";
import { BookOpen, Package } from "lucide-react";
import { CustomerLogoutButton } from "@/components/customer-portal/logout-button";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

/** "9876501234" (or +919876501234) → "98765 01234". */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

/**
 * Top of the signed-in customer area: who's signed in, sign out, and the
 * two things they came for — their orders and their khata with the shop.
 */
export function PortalHeader({
  name,
  phone,
  active,
  dueInPaise,
}: {
  name: string | null;
  phone: string;
  active: "orders" | "khata";
  dueInPaise: number;
}) {
  const tabs = [
    { key: "orders", href: "/track/orders", label: "My orders", icon: Package, badge: null },
    {
      key: "khata",
      href: "/track/khata",
      label: "Mera Khata",
      icon: BookOpen,
      badge: dueInPaise > 0 ? formatPaise(dueInPaise) : null,
    },
  ] as const;

  return (
    <header className="flex flex-col gap-3">
      <h1 className="sr-only">{active === "orders" ? "My orders" : "Mera Khata"}</h1>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {name && <p className="truncate text-base font-extrabold leading-tight">{name}</p>}
          <p className="text-sm text-muted-foreground tabular-nums">{formatPhone(phone)}</p>
        </div>
        <CustomerLogoutButton />
      </div>

      <nav aria-label="Your account" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {tabs.map((tab) => {
          const current = tab.key === active;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                current ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.006_270/10%)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {tab.label}
              {tab.badge && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-extrabold leading-none text-primary-foreground tabular-nums">
                  {tab.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
