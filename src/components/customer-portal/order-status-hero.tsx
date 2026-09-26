import { Check } from "lucide-react";
import { customerOrderStatus, customerOrderSteps, type StatusTone } from "@/lib/customer-portal/order-status-copy";
import { cn } from "@/lib/utils";
import type { Order } from "@prisma/client";

const TONE_SURFACE: Record<StatusTone, string> = {
  active: "bg-card",
  ready: "bg-brand-soft",
  done: "bg-card",
  cancelled: "bg-muted",
};

/**
 * The first thing on an order: where it is, in words, and the five steps
 * from placed to delivered/collected. The current step is the only red
 * one, so "where is it?" is answered at a glance.
 */
export function OrderStatusHero({ order, children }: { order: Order; children?: React.ReactNode }) {
  const status = customerOrderStatus(order);
  const showSteps = order.status !== "CANCELLED" && order.fulfillmentType !== "COUNTER_HANDOVER";
  const steps = customerOrderSteps(order.fulfillmentType, order.status);

  return (
    <section aria-labelledby="status-heading" className={cn("rounded-3xl border border-border p-5", TONE_SURFACE[status.tone])}>
      <h2
        id="status-heading"
        className={cn(
          "font-heading text-2xl font-extrabold leading-tight tracking-[-0.015em] text-balance",
          status.tone === "ready" && "text-brand-deep",
          status.tone === "cancelled" && "text-muted-foreground",
        )}
      >
        {status.title}
      </h2>
      <p className={cn("mt-1 text-sm", status.tone === "ready" ? "text-brand-deep/85" : "text-muted-foreground")}>{status.detail}</p>

      {showSteps && (
        <ol className="mt-5 grid grid-cols-5" aria-label="Order progress">
          {steps.map((step, index) => (
            <li
              key={step.status}
              aria-current={step.state === "current" ? "step" : undefined}
              className="relative flex flex-col items-center gap-1.5 text-center"
            >
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2",
                    step.state === "todo" ? "bg-border" : "bg-primary",
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 flex size-6 items-center justify-center rounded-full",
                  step.state === "done" && "bg-primary text-primary-foreground",
                  step.state === "current" && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  step.state === "todo" && "border-2 border-border bg-card",
                )}
              >
                {step.state === "done" && <Check className="size-3.5" strokeWidth={3} />}
                {step.state === "current" && <span className="size-2 rounded-full bg-primary-foreground" />}
              </span>
              <span
                className={cn(
                  "text-[11px] leading-tight",
                  step.state === "current" ? "font-extrabold text-foreground" : step.state === "done" ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
                <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "current" ? " (now)" : ""}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {children && <div className="mt-5 flex flex-col gap-2">{children}</div>}
    </section>
  );
}
