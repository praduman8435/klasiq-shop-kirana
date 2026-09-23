import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Products laid out like a printed sheet of pack labels: panels share one
 * 1px black rule instead of floating as separate cards. Each panel draws
 * its own full box, pulled 1px up and left so neighbouring edges overlap
 * into a single rule — an incomplete last row simply ends, with no rule
 * running past the last panel at any column count. Shared by the
 * homepage shelf and every category/search grid.
 */
export function ProductSheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 pl-px pt-px sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        "[&>*]:-ml-px [&>*]:-mt-px [&>*]:border [&>*]:border-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
