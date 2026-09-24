import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export type SalesChartPoint = { key: string; label: string; fullLabel: string; valueInPaise: number; isCurrent: boolean };

/** One series, one hue (validated against the admin card surface). */
const BAR = "bg-[#3987e5]";

/**
 * Sales as a simple bar chart. Single series, so no legend: the section
 * title names it. Bars sit on the baseline with rounded tops and a 2px
 * gap; hovering a bar shows its day/month and value, only the current
 * bar's value is printed, and x labels thin out when there are many bars.
 * A visually hidden table carries the same numbers for screen readers.
 */
export function DashboardSalesChart({ points, caption }: { points: SalesChartPoint[]; caption: string }) {
  const max = Math.max(...points.map((d) => d.valueInPaise), 1);
  const every = points.length > 16 ? Math.ceil(points.length / 8) : 1;

  return (
    <figure className="relative flex flex-col gap-2">
      <div className="flex h-44 items-end gap-0.5" aria-hidden>
        {points.map((point, index) => {
          const height = point.valueInPaise === 0 ? 0 : Math.max(3, Math.round((point.valueInPaise / max) * 85));
          return (
            <div key={point.key} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              {point.isCurrent && point.valueInPaise > 0 && points.length <= 16 && (
                <span className="mb-1 text-[11px] font-medium whitespace-nowrap text-foreground tabular-nums">
                  {formatPaise(point.valueInPaise)}
                </span>
              )}
              <span
                className={cn("w-full max-w-10 rounded-t-[4px] transition-opacity", BAR, !point.isCurrent && "opacity-70 group-hover:opacity-100")}
                style={{ height: `${height}%` }}
              />
              {point.valueInPaise === 0 && <span className="h-px w-full max-w-10 bg-border" />}
              <span className="absolute inset-0" />
              <span
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block",
                  index < points.length / 4 ? "left-0" : index > (points.length * 3) / 4 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {point.fullLabel} · <span className="font-medium tabular-nums">{formatPaise(point.valueInPaise)}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5 border-t border-border pt-1.5" aria-hidden>
        {points.map((point, index) => (
          <span
            key={point.key}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-[11px]",
              point.isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {index % every === 0 || point.isCurrent ? point.label : ""}
          </span>
        ))}
      </div>

      {/* sr-only goes on a wrapper, not the table: a table's caption is drawn
          outside the table box, so Firefox would still show it. */}
      <div className="sr-only">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Sales</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <td>{point.fullLabel}</td>
                <td>{formatPaise(point.valueInPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
