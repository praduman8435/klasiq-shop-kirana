import { describeSupplierBalance } from "@/lib/supplier-balance";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BALANCE_TONE_CLASS } from "@/components/admin/supplier-balance";

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/**
 * Desktop-only context beside the New bill / Pay forms: the balance right
 * now and a short list (latest entries, or unpaid bills) — enough to spot
 * a bill entered twice or check which bill is still open, without leaving
 * the form. Hidden on phones, where the form stays uncluttered.
 */
export function SupplierSidePanel({
  balanceInPaise,
  title,
  rows,
  empty,
}: {
  balanceInPaise: number;
  title: string;
  rows: { key: string; date: Date; label: string; amountInPaise: number; sign?: 1 | -1 }[];
  empty: string;
}) {
  const balance = describeSupplierBalance(balanceInPaise);
  return (
    <aside className="hidden rounded-xl border border-border bg-card lg:block">
      <div className="border-b border-border p-4">
        <p className="text-sm text-muted-foreground">
          {balance.tone === "owe" ? "To pay now · Dena hai" : balance.tone === "advance" ? "You paid extra · Lena hai" : "Hisaab barabar"}
        </p>
        <p className={cn("mt-1 text-2xl font-semibold tabular-nums", BALANCE_TONE_CLASS[balance.tone])}>
          {balance.tone === "settled" ? "All paid" : formatPaise(balance.amountInPaise)}
        </p>
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold">{title}</p>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-muted-foreground">
                  <span className="tabular-nums">{DAY.format(row.date)}</span> · {row.label}
                </span>
                <span className={cn("shrink-0 tabular-nums", row.sign === -1 ? "text-emerald-400" : "text-foreground")}>
                  {row.sign === -1 ? "−" : row.sign === 1 ? "+" : ""}
                  {formatPaise(row.amountInPaise)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
