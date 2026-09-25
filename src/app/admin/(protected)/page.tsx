import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  ChevronRight,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  PackageX,
  Plus,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSalesChart } from "@/components/admin/dashboard-sales-chart";
import { daysSince } from "@/lib/khata";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SALES_RANGES, getDashboardOverview, type SalesRange } from "@/server/queries/admin/dashboard";

const RANGE_LABEL: Record<SalesRange, string> = { week: "Week", month: "Month", year: "Year", custom: "Custom" };
const RANGE_CAPTION: Record<SalesRange, string> = {
  week: "Sales, last 7 days",
  month: "Sales, last 30 days",
  year: "Sales, last 12 months",
  custom: "Sales for the dates you picked",
};

type PageProps = { searchParams: Promise<{ range?: string; from?: string; to?: string }> };

const SHORTCUTS = [
  { href: "/admin/counter-sale", label: "Counter sale", icon: ShoppingBag },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/khatabook", label: "KhataBook", icon: BookOpen },
  { href: "/admin/suppliers", label: "Suppliers", icon: Truck },
  { href: "/admin/inventory", label: "Update stock", icon: Boxes },
  { href: "/admin/products/new", label: "Add product", icon: Plus },
] as const;

function oldestLabel(days: number) {
  return days === 0 ? "oldest from today" : `oldest ${days} day${days === 1 ? "" : "s"} old`;
}

type AttentionItem = { href: string; icon: LucideIcon; title: string; detail: string; tone?: "warn" | "danger" };

/**
 * The owner's home screen: today's hisaab at a glance (sales, money in,
 * udhaar given), what needs doing now, and how the week is going. Every
 * number links to the screen where it's acted on.
 */
export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const range = SALES_RANGES.find((r) => r === query.range) ?? "week";
  const data = await getDashboardOverview(new Date(), { range, from: query.from, to: query.to });
  const { today, attention: a, series } = data;
  const g = today.galla;
  const showCard = today.received.CARD > 0 || g.paidToSuppliers.CARD > 0;
  const hasSupplierRefunds = g.supplierRefunds.CASH + g.supplierRefunds.UPI + g.supplierRefunds.CARD > 0;
  const diff = today.salesInPaise - today.yesterdaySalesInPaise;

  const attention: AttentionItem[] = [];
  if (a.newOrders > 0)
    attention.push({ href: "/admin/orders?tab=NEW", icon: PackageOpen, title: `${a.newOrders} new online order${a.newOrders === 1 ? "" : "s"}`, detail: "Accept and start packing", tone: "warn" });
  if (a.packing > 0)
    attention.push({ href: "/admin/orders?tab=PACKING", icon: ClipboardList, title: `${a.packing} being packed`, detail: "Mark ready when done" });
  if (a.readyForPickup > 0)
    attention.push({ href: "/admin/orders?tab=READY", icon: PackageCheck, title: `${a.readyForPickup} ready for pickup`, detail: "Waiting for the customer" });
  if (a.outForDelivery > 0)
    attention.push({ href: "/admin/orders?tab=READY", icon: Truck, title: `${a.outForDelivery} out for delivery`, detail: "Mark delivered when handed over" });
  if (a.outOfStock > 0)
    attention.push({ href: "/admin/inventory?stock=OUT_OF_STOCK", icon: PackageX, title: `${a.outOfStock} item${a.outOfStock === 1 ? "" : "s"} out of stock`, detail: "Customers can't buy these", tone: "danger" });
  if (a.lowStock > 0)
    attention.push({ href: "/admin/inventory?stock=LOW_STOCK", icon: AlertTriangle, title: `${a.lowStock} item${a.lowStock === 1 ? "" : "s"} running low`, detail: "Order more from suppliers", tone: "warn" });
  if (a.udhaarDueInPaise > 0)
    attention.push({
      href: "/admin/khatabook?tab=COLLECT",
      icon: BookOpen,
      title: `${formatPaise(a.udhaarDueInPaise)} udhaar to collect`,
      detail: `${a.udhaarCustomers} customer${a.udhaarCustomers === 1 ? "" : "s"}${a.oldestDueSince ? ` · ${oldestLabel(daysSince(a.oldestDueSince))}` : ""}`,
    });
  if (a.supplierOwedInPaise > 0)
    attention.push({
      href: "/admin/suppliers?filter=TO_PAY",
      icon: Wallet,
      title: `${formatPaise(a.supplierOwedInPaise)} to pay suppliers`,
      detail: `${a.suppliersOwed} supplier${a.suppliersOwed === 1 ? "" : "s"}`,
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Dashboard</h1>
        <Button render={<Link href="/admin/counter-sale" />} nativeButton={false} className="h-10">
          <ShoppingBag className="size-4" aria-hidden />
          New counter sale
        </Button>
      </div>

      <section aria-labelledby="galla-heading" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
          <h2 id="galla-heading" className="text-sm font-semibold">
            Today&apos;s cash &amp; UPI · Aaj ka galla
          </h2>
          <p className="text-xs text-muted-foreground">Tally this with the drawer when you close the shop</p>
        </div>
        <div className={cn("grid gap-px px-4 pt-3 sm:px-5", showCard ? "grid-cols-3" : "grid-cols-2")}>
          <div>
            <p className="text-sm text-muted-foreground">Cash in drawer</p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums sm:text-4xl">{formatPaise(g.net.CASH)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">UPI received</p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums sm:text-4xl">{formatPaise(g.net.UPI)}</p>
          </div>
          {showCard && (
            <div>
              <p className="text-sm text-muted-foreground">Card</p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums sm:text-4xl">{formatPaise(g.net.CARD)}</p>
            </div>
          )}
        </div>
        <table className="relative mt-4 w-full border-t border-border text-sm">
          <caption className="sr-only">How today&apos;s cash and UPI add up</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 text-left font-medium sm:px-5" />
              <th scope="col" className="px-2 py-2 text-right font-medium">Cash</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">UPI</th>
              {showCard && <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">Card</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              { label: "Counter sales", v: g.counterSales, sign: 1 },
              { label: "Udhaar paid back", v: g.udhaarRepaid, sign: 1 },
              ...(g.onlinePaidCount > 0 ? [{ label: `Online orders paid (${g.onlinePaidCount})`, v: g.onlinePaid, sign: 1 }] : []),
              ...(hasSupplierRefunds ? [{ label: "Refund from suppliers", v: g.supplierRefunds, sign: 1 }] : []),
              { label: "Paid to suppliers", v: g.paidToSuppliers, sign: -1 },
            ].map((row) => (
              <tr key={row.label} className="text-muted-foreground">
                <th scope="row" className="px-4 py-2 text-left font-normal sm:px-5">
                  {row.label}
                </th>
                {(["CASH", "UPI", ...(showCard ? (["CARD"] as const) : [])] as const).map((m, i, all) => (
                  <td key={m} className={cn("py-2 text-right tabular-nums", i === all.length - 1 ? "px-4 sm:px-5" : "px-2")}>
                    {row.v[m] === 0 ? "—" : `${row.sign < 0 ? "− " : ""}${formatPaise(row.v[m])}`}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <th scope="row" className="px-4 py-2 text-left sm:px-5">
                Total today
              </th>
              {(["CASH", "UPI", ...(showCard ? (["CARD"] as const) : [])] as const).map((m, i, all) => (
                <td key={m} className={cn("py-2 text-right tabular-nums", i === all.length - 1 ? "px-4 sm:px-5" : "px-2")}>
                  {formatPaise(g.net[m])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {g.onlinePaidCount > 0 && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-5">
            Online orders paid at pickup or delivery are counted as cash.
          </p>
        )}
      </section>

      <section aria-label="Today's sales" className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
        <div className="border-b border-border p-4 sm:border-r sm:border-b-0 sm:p-5">
          <p className="text-sm text-muted-foreground">Sales today · Aaj ki bikri</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPaise(today.salesInPaise)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {today.billCount} bill{today.billCount === 1 ? "" : "s"} · {formatPaise(today.counter.valueInPaise)} counter ·{" "}
            {formatPaise(today.online.valueInPaise)} online
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {diff > 0 && <TrendingUp className="size-3.5 shrink-0" aria-hidden />}
            {diff < 0 && <TrendingDown className="size-3.5 shrink-0" aria-hidden />}
            {today.yesterdaySalesInPaise === 0 && today.salesInPaise === 0
              ? "No sales yesterday either"
              : diff === 0
                ? "Same as yesterday"
                : `${formatPaise(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than yesterday (${formatPaise(today.yesterdaySalesInPaise)})`}
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">Udhaar given today</p>
          <p className={cn("mt-1 text-2xl font-semibold tabular-nums", today.udhaarGivenInPaise > 0 && "text-amber-500")}>
            {formatPaise(today.udhaarGivenInPaise)}
          </p>
          <Link href="/admin/khatabook" className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            Total to collect {formatPaise(a.udhaarDueInPaise)}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </section>

      <section aria-labelledby="sales-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="sales-heading" className="text-sm font-semibold">
              Sales
            </h2>
            <p className="text-xs text-muted-foreground">{series.rangeLabel}</p>
          </div>
          <nav aria-label="Sales period" className="flex gap-1 rounded-lg border border-border p-0.5">
            {SALES_RANGES.map((r) => (
              <Link
                key={r}
                href={r === "week" ? "/admin" : `/admin?range=${r}`}
                aria-current={series.range === r ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  series.range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {RANGE_LABEL[r]}
              </Link>
            ))}
          </nav>
        </div>

        {range === "custom" && (
          <form method="get" action="/admin" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="range" value="custom" />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From
              <input type="date" name="from" defaultValue={query.from} required className="h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To
              <input type="date" name="to" defaultValue={query.to} required className="h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
            </label>
            <Button type="submit" className="h-10">
              Show
            </Button>
            {series.range !== "custom" && <p className="basis-full text-xs text-muted-foreground">Pick both dates to see that period. Showing the last 7 days.</p>}
          </form>
        )}

        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatPaise(series.totalInPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Bills</dt>
            <dd className="text-lg font-semibold tabular-nums">{series.billCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Average a {series.unit === "month" ? "month" : "day"}</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatPaise(series.averageInPaise)}</dd>
          </div>
        </dl>
        <DashboardSalesChart points={series.points} caption={RANGE_CAPTION[series.range]} />
        {series.best && (
          <p className="text-xs text-muted-foreground">
            Best {series.unit === "month" ? "month" : "day"}: {series.best.fullLabel}, {formatPaise(series.best.valueInPaise)}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="mb-2 text-sm font-semibold">
            Needs attention
          </h2>
          {attention.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium">All caught up</p>
              <p className="mt-1 text-sm text-muted-foreground">No orders waiting, stock looks fine, and no dues pending.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {attention.map((item) => (
                <li key={item.title}>
                  <Link href={item.href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                        item.tone === "danger" ? "bg-destructive/15 text-destructive" : item.tone === "warn" ? "bg-amber-500/15 text-amber-500" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <item.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Top items" className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div>
            <p className="text-sm font-semibold">Top items · last 7 days</p>
            {data.topItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing sold this week yet.</p>
            ) : (
              <ol className="mt-2 flex flex-col gap-1.5">
                {data.topItems.map((item, i) => (
                  <li key={`${item.name}-${item.size}`} className="flex items-baseline gap-3 text-sm">
                    <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.name} <span className="text-muted-foreground">· {item.size}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{item.quantity} sold</span>
                    <span className="w-16 shrink-0 text-right font-medium tabular-nums">{formatPaise(item.valueInPaise)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      <nav aria-label="Shortcuts" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SHORTCUTS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 text-center text-xs font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="size-5 text-muted-foreground" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
