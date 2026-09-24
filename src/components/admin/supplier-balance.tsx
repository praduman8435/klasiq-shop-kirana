import { describeSupplierBalance, type SupplierBalanceTone } from "@/lib/supplier-balance";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Amber = the shop owes (same as KhataBook's outstanding), emerald =
 * advance with the supplier, muted = settled. */
export const BALANCE_TONE_CLASS: Record<SupplierBalanceTone, string> = {
  owe: "text-amber-500",
  advance: "text-emerald-400",
  settled: "text-muted-foreground",
};

/** A supplier's balance as a list cell: amount, and the Hindi hint under it. */
export function SupplierBalanceCell({ netInPaise, className }: { netInPaise: number; className?: string }) {
  const balance = describeSupplierBalance(netInPaise);
  return (
    <div className={cn("flex flex-col items-end text-right", className)}>
      <span className={cn("text-sm font-semibold tabular-nums", BALANCE_TONE_CLASS[balance.tone])}>
        {balance.tone === "settled" ? "Settled" : formatPaise(balance.amountInPaise)}
      </span>
      <span className="text-xs text-muted-foreground">
        {balance.tone === "owe" ? "To pay · Dena hai" : balance.tone === "advance" ? "Advance · Lena hai" : "Hisaab barabar"}
      </span>
    </div>
  );
}
