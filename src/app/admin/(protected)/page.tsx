import Link from "next/link";
import { Boxes, Plus, ShoppingBag, ClipboardList } from "lucide-react";
import { DashboardMetricGroup } from "@/components/admin/stat-card";
import { formatPaise } from "@/lib/money";
import { getDashboardStats } from "@/server/queries/admin/dashboard";

const QUICK_ACTIONS = [
  { href: "/admin/counter-sale", label: "Counter Sale", icon: ShoppingBag },
  { href: "/admin/products/new", label: "Add Product", icon: Plus },
  { href: "/admin/inventory", label: "Update Stock", icon: Boxes },
  { href: "/admin/orders", label: "View Orders", icon: ClipboardList },
] as const;

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

  return (
    // AdminShell itself now establishes the dark scope + background for
    // the whole admin application — this page just renders its own
    // content directly into it, no separate rounded "card" of its own
    // (that used to double up a second identical dark background inside
    // a first one, reading as a floating panel once the shell around it
    // was still light).
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">What needs attention right now.</p>
      </div>

      <div className="flex flex-col gap-6">
        <section>
          <h2 className="text-sm font-semibold">Orders</h2>
          <div className="mt-2">
            <DashboardMetricGroup
              wideCols={4}
              metrics={[
                { label: "Pending", value: stats.pendingCount, href: "/admin/orders?status=PENDING" },
                { label: "Confirmed", value: stats.confirmedCount, href: "/admin/orders?status=CONFIRMED" },
                {
                  label: "Ready for Pickup",
                  value: stats.readyForPickupCount,
                  href: "/admin/orders?status=READY_FOR_PICKUP",
                },
                {
                  label: "Out for Delivery",
                  value: stats.outForDeliveryCount,
                  href: "/admin/orders?status=OUT_FOR_DELIVERY",
                },
              ]}
            />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Today</h2>
          <div className="mt-2">
            <DashboardMetricGroup
              metrics={[
                { label: "Orders today", value: stats.ordersToday },
                { label: "Order value", value: formatPaise(stats.todaysOrderValueInPaise) },
              ]}
            />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Inventory</h2>
          <div className="mt-2">
            <DashboardMetricGroup
              metrics={[
                {
                  label: "Low stock",
                  value: stats.lowStockCount,
                  href: "/admin/inventory?stock=LOW_STOCK",
                  tone: "warning",
                },
                {
                  label: "Out of stock",
                  value: stats.outOfStockCount,
                  href: "/admin/inventory?stock=OUT_OF_STOCK",
                  tone: "danger",
                },
              ]}
            />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Quick actions</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-border bg-border">
            <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
              {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 bg-card p-3.5 text-sm font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/40"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
