import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
const FULL_DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short" });

/** One series, one hue (validated against the admin card surface). */
const BAR = "bg-[#3987e5]";

/**
 * Sales for the last 7 days as a small bar strip. Single series, so no
 * legend: the section title names it. Bars are anchored to the baseline
 * with rounded tops and a 2px gap; hovering a bar shows its day and
 * value, and only today's value is printed as a direct label.
 * A visually hidden table carries the same numbers for screen readers.
 */
export function DashboardWeekChart({ days }: { days: { date: Date; valueInPaise: number; isToday: boolean }[] }) {
  const max = Math.max(...days.map((d) => d.valueInPaise), 1);
  const total = days.reduce((s, d) => s + d.valueInPaise, 0);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">Last 7 days</span>
        <span className="text-sm text-muted-foreground tabular-nums">{formatPaise(total)} total</span>
      </figcaption>

      <div className="flex h-36 items-end gap-0.5" aria-hidden>
        {days.map((day, index) => {
          const height = day.valueInPaise === 0 ? 0 : Math.max(4, Math.round((day.valueInPaise / max) * 85));
          return (
            <div key={day.date.toISOString()} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              {day.isToday && day.valueInPaise > 0 && (
                <span className="mb-1 text-[11px] font-medium text-foreground tabular-nums">{formatPaise(day.valueInPaise)}</span>
              )}
              <span
                className={cn("w-full max-w-10 rounded-t-[4px] transition-opacity", BAR, !day.isToday && "opacity-70 group-hover:opacity-100")}
                style={{ height: `${height}%` }}
              />
              {day.valueInPaise === 0 && <span className="h-px w-full max-w-10 bg-border" />}
              {/* Hit target covers the whole column, bigger than the bar. */}
              <span className="absolute inset-0" />
              <span
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block",
                  // Keep the end tooltips inside the card.
                  index === 0 ? "left-0" : index === days.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {FULL_DAY.format(day.date)} · <span className="font-medium tabular-nums">{formatPaise(day.valueInPaise)}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="-mt-1 flex gap-0.5 border-t border-border pt-1.5" aria-hidden>
        {days.map((day) => (
          <span
            key={day.date.toISOString()}
            className={cn("flex-1 text-center text-[11px]", day.isToday ? "font-semibold text-foreground" : "text-muted-foreground")}
          >
            {day.isToday ? "Today" : WEEKDAY.format(day.date)}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Sales for the last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Sales</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date.toISOString()}>
              <td>{FULL_DAY.format(day.date)}</td>
              <td>{formatPaise(day.valueInPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
