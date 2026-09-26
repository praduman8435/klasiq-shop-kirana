"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The customer area's bottom sheet: slides up from the thumb zone on a
 * phone, sits as a centred card on wider screens. Re-applies the
 * storefront theme because the sheet is portalled outside it.
 */
export function CustomerSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "store-theme mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto overscroll-contain rounded-t-3xl border-0 bg-card px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-4 sm:rounded-3xl",
          className,
        )}
      >
        <span aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
        <SheetTitle className="pr-10 font-heading text-xl font-extrabold leading-tight tracking-[-0.01em] text-foreground">
          {title}
        </SheetTitle>
        {description && <SheetDescription className="mt-1 text-sm text-muted-foreground">{description}</SheetDescription>}
        <div className="mt-4 flex flex-col">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
