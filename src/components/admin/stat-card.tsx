import Link from "next/link";
import { cn } from "@/lib/utils";

export type DashboardMetric = {
  label: string;
  value: string | number;
  href?: string;
  tone?: "default" | "warning" | "danger";
};

const TONE_CLASS: Record<NonNullable<DashboardMetric["tone"]>, string> = {
  default: "text-foreground",
  warning: "text-amber-500",
  danger: "text-destructive",
};

/**
 * Replaces the old one-metric-per-bordered-card grid with a single
 * continuous surface, hairline-divided between cells — the same
 * "no card-in-card" principle established on Counter Sale/Orders,
 * applied to Dashboard's own "at-a-glance operations" purpose. Each
 * cell is independently clickable (when `href` is given) with a quiet
 * hover surface, restrained to `text-xl` values rather than a giant
 * dashboard number. `wideCols` controls how many columns the group
 * expands to at `sm` and up — 2 for a two-metric group, 3 for a
 * three-metric group (Inventory's own summary), 4 for Orders' own
 * four-metric group — collapsing to 2 on mobile either way. An odd
 * metric out (a 3-item group on a 2-column mobile grid) spans the full
 * row instead of leaving an empty cell beside it.
 */
export function DashboardMetricGroup({
  metrics,
  wideCols = 2,
}: {
  metrics: DashboardMetric[];
  wideCols?: 2 | 3 | 4;
}) {
  // The classic grid-line trick: the outer surface IS the divider color,
  // a 1px `gap` between cells reveals it as hairlines, and each cell
  // paints over the rest with its own solid background — this produces
  // a correct table-like divider at every column count/row-wrap
  // combination, unlike `divide-x`/`divide-y` which misplaces borders
  // the moment a grid wraps to a new row.
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-border">
      <div
        className={cn(
          "grid grid-cols-2 gap-px",
          wideCols === 3 && "sm:grid-cols-3",
          wideCols === 4 && "sm:grid-cols-4",
        )}
      >
        {metrics.map((metric, index) => {
          const isTrailingOdd = metrics.length % 2 !== 0 && index === metrics.length - 1;
          const cellClass = cn(
            "flex flex-col gap-1 bg-card p-3.5 transition-colors",
            isTrailingOdd && "col-span-2 sm:col-span-1",
          );
          const inner = (
            <>
              <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
              <span className={cn("text-xl font-semibold tabular-nums", TONE_CLASS[metric.tone ?? "default"])}>
                {metric.value}
              </span>
            </>
          );
          if (!metric.href) {
            return (
              <div key={metric.label} className={cellClass}>
                {inner}
              </div>
            );
          }
          return (
            <Link key={metric.label} href={metric.href} className={cn(cellClass, "hover:bg-muted/40")}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
