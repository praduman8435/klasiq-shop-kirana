import { buildInvoiceModel, type InvoiceDesign, type InvoiceModel } from "@/lib/invoice-model";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/server/commerce/invoice";

/**
 * A bill in one of four designs. Always a light "paper" document (never
 * theme-aware) so it prints and screenshots the same everywhere. Each
 * design sets its own printed page: A4 for classic/modern/minimal, an
 * 80 mm roll for thermal counter printers.
 */
export function InvoiceDocument({ invoice, design }: { invoice: Invoice; design: InvoiceDesign }) {
  const model = buildInvoiceModel(invoice);
  return (
    <>
      <style>{design === "thermal" ? "@page { size: 80mm auto; margin: 3mm; }" : "@page { size: A4; margin: 12mm; }"}</style>
      {design === "classic" && <Classic m={model} />}
      {design === "modern" && <Modern m={model} />}
      {design === "thermal" && <Thermal m={model} />}
      {design === "minimal" && <Minimal m={model} />}
    </>
  );
}

function BillTo({ m, className }: { m: InvoiceModel; className?: string }) {
  if (!m.customer.name && !m.customer.mobile && m.customer.addressLines.length === 0) {
    return <p className={cn("text-sm text-neutral-500", className)}>Walk-in customer</p>;
  }
  return (
    <div className={cn("text-sm", className)}>
      {m.customer.name && <p className="font-semibold text-neutral-900">{m.customer.name}</p>}
      {m.customer.mobile && <p className="text-neutral-600">{m.customer.mobile}</p>}
      {m.customer.addressLines.map((line) => (
        <p key={line} className="text-neutral-600">
          {line}
        </p>
      ))}
    </div>
  );
}

function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Totals block shared by the A4 designs. */
function Totals({ m, accent }: { m: InvoiceModel; accent?: string }) {
  return (
    <div className="ml-auto w-full max-w-xs text-sm">
      <Row label={<span className="text-neutral-500">Subtotal</span>} value={m.subtotal} className="py-1" />
      {m.discount && <Row label={<span className="text-neutral-500">{m.discount.label}</span>} value={m.discount.amount} className="py-1" />}
      {m.delivery && <Row label={<span className="text-neutral-500">Delivery</span>} value={m.delivery} className="py-1" />}
      <Row
        label={<span className="font-semibold text-neutral-900">Total</span>}
        value={<span className={cn("text-lg font-bold text-neutral-900", accent)}>{m.total}</span>}
        className="mt-1 border-t border-neutral-900 pt-2"
      />
      {m.payment.paid && m.payment.due && (
        <Row label={<span className="text-neutral-500">Paid ({m.payment.method})</span>} value={m.payment.paid} className="py-1" />
      )}
      {m.payment.due && (
        <Row
          label={<span className="font-semibold text-amber-700">{m.payment.dueLabel}</span>}
          value={<span className="font-semibold text-amber-700">{m.payment.due}</span>}
          className="py-1"
        />
      )}
    </div>
  );
}

function ItemsTable({ m, head, zebra }: { m: InvoiceModel; head: string; zebra?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className={cn("text-left text-xs font-semibold tracking-wide uppercase", head)}>
          <th className="w-8 py-2 pr-2 font-semibold">#</th>
          <th className="py-2 pr-2 font-semibold">Item</th>
          <th className="w-14 py-2 pr-2 text-right font-semibold">Qty</th>
          <th className="hidden w-20 py-2 pr-2 text-right font-semibold sm:table-cell print:table-cell">Rate</th>
          <th className="w-24 py-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {m.rows.map((r) => (
          <tr key={r.n} className={cn("border-b border-neutral-200 align-top", zebra && r.n % 2 === 0 && "bg-neutral-50")}>
            <td className="py-2.5 pr-2 text-neutral-400 tabular-nums">{r.n}</td>
            <td className="py-2.5 pr-2">
              <span className="font-medium text-neutral-900">{r.name}</span>
              <span className="block text-xs text-neutral-500">
                {r.size}
                <span className="sm:hidden print:hidden"> · {r.quantity} × {r.rate}</span>
              </span>
            </td>
            <td className="py-2.5 pr-2 text-right tabular-nums">{r.quantity}</td>
            <td className="hidden py-2.5 pr-2 text-right text-neutral-600 tabular-nums sm:table-cell print:table-cell">{r.rate}</td>
            <td className="py-2.5 text-right font-medium text-neutral-900 tabular-nums">
              {r.struck && <span className="block text-xs font-normal text-neutral-400 line-through">{r.struck}</span>}
              {r.amount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Footer({ m, className }: { m: InvoiceModel; className?: string }) {
  return (
    <div className={cn("text-center text-xs text-neutral-500", className)}>
      <p className="font-medium text-neutral-700">Thank you for shopping with us · Dhanyavaad</p>
      <p className="mt-0.5">
        {m.shop.name} · {m.shop.phone} · Order online at {m.shop.brand}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Classic({ m }: { m: InvoiceModel }) {
  return (
    <article className="mx-auto w-full max-w-2xl bg-white p-6 text-neutral-800 sm:p-10 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-2xl font-bold tracking-tight text-neutral-900">{m.shop.name}</p>
          <p className="mt-1 text-sm text-neutral-500">Phone {m.shop.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tracking-[0.2em] text-neutral-400 uppercase">Bill</p>
          <p className="mt-1 font-mono text-sm font-semibold whitespace-nowrap text-neutral-900">{m.number}</p>
          <p className="text-sm text-neutral-500">
            {m.date}, {m.time}
          </p>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-2 gap-6 border-y border-neutral-200 py-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Bill to</p>
          <BillTo m={m} />
        </div>
        <div className="text-right text-sm">
          <p className="mb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Details</p>
          <p className="text-neutral-700">{m.kind}</p>
          <p className="text-neutral-700">
            {m.payment.status} · {m.payment.method}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ItemsTable m={m} head="border-b border-neutral-900 text-neutral-500" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-6">
        <p className="text-xs text-neutral-500">
          {m.itemCount} item{m.itemCount === 1 ? "" : "s"} · {m.totalQuantity} unit{m.totalQuantity === 1 ? "" : "s"}
        </p>
        <Totals m={m} />
      </div>
      <Footer m={m} className="mt-12 border-t border-neutral-200 pt-4" />
    </article>
  );
}

function Modern({ m }: { m: InvoiceModel }) {
  return (
    <article className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white text-neutral-800 shadow-sm print:max-w-none print:rounded-none print:shadow-none">
      <header className="bg-[oklch(0.54_0.21_27)] px-6 py-6 text-white sm:px-10 print:[print-color-adjust:exact]">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-2xl font-extrabold tracking-tight">{m.shop.name}</p>
            <p className="mt-0.5 text-sm text-white/80">Phone {m.shop.phone}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono font-semibold whitespace-nowrap">{m.number}</p>
            <p className="text-white/80">
              {m.date} · {m.time}
            </p>
          </div>
        </div>
      </header>

      <div className="px-6 py-6 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-neutral-50 p-5 print:[print-color-adjust:exact]">
          <div>
            <p className="text-sm text-neutral-500">Total amount</p>
            <p className="text-4xl font-extrabold tracking-tight text-neutral-900 tabular-nums">{m.total}</p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm font-semibold print:[print-color-adjust:exact]",
              m.payment.isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
            )}
          >
            {m.payment.due ? `${m.payment.dueLabel} ${m.payment.due}` : `${m.payment.status} · ${m.payment.method}`}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap justify-between gap-6">
          <div>
            <p className="mb-1 text-xs font-semibold text-neutral-400">BILLED TO</p>
            <BillTo m={m} />
          </div>
          <div className="text-right text-sm text-neutral-600">
            <p className="mb-1 text-xs font-semibold text-neutral-400">ORDER</p>
            <p>{m.kind}</p>
            <p>
              {m.itemCount} item{m.itemCount === 1 ? "" : "s"}, {m.totalQuantity} unit{m.totalQuantity === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <ItemsTable m={m} head="text-neutral-400 border-b border-neutral-200" zebra />
        </div>
        <div className="mt-4">
          <Totals m={m} accent="text-[oklch(0.54_0.21_27)]" />
        </div>
        <Footer m={m} className="mt-10" />
      </div>
    </article>
  );
}

function Thermal({ m }: { m: InvoiceModel }) {
  const dash = "border-t border-dashed border-neutral-400";
  return (
    <article className="mx-auto w-full max-w-[320px] bg-white px-4 py-5 font-mono text-[12px] leading-snug text-neutral-900 print:max-w-none print:px-0 print:py-0">
      <header className="text-center">
        <p className="text-base font-bold tracking-tight uppercase">{m.shop.name}</p>
        <p>Ph {m.shop.phone}</p>
      </header>
      <div className={cn("mt-3 pt-2", dash)}>
        <Row label="Bill" value={m.number} />
        <Row label="Date" value={`${m.date} ${m.time}`} />
        {m.customer.name && <Row label="Customer" value={m.customer.name} />}
        {m.customer.mobile && <Row label="Mobile" value={m.customer.mobile} />}
      </div>
      <div className={cn("mt-2 pt-2", dash)}>
        {m.rows.map((r) => (
          <div key={r.n} className="py-1">
            <p className="font-semibold">
              {r.name} <span className="font-normal">{r.size}</span>
            </p>
            <Row label={`${r.quantity} x ${r.rate}`} value={r.amount} />
          </div>
        ))}
      </div>
      <div className={cn("mt-2 pt-2", dash)}>
        <Row label={`Items ${m.itemCount} / Qty ${m.totalQuantity}`} value={m.subtotal} />
        {m.discount && <Row label="Discount" value={m.discount.amount} />}
        {m.delivery && <Row label="Delivery" value={m.delivery} />}
      </div>
      <div className={cn("mt-2 border-t-2 border-double border-neutral-900 pt-2")}>
        <Row label={<span className="text-sm font-bold">TOTAL</span>} value={<span className="text-sm font-bold">{m.total}</span>} />
        {m.payment.paid && <Row label={`Paid (${m.payment.method})`} value={m.payment.paid} />}
        {m.payment.due && <Row label={m.payment.dueLabel ?? "Due"} value={m.payment.due} />}
      </div>
      <footer className={cn("mt-3 pt-2 text-center", dash)}>
        <p className="font-semibold">Dhanyavaad! Phir aaiye.</p>
        <p>Order online: {m.shop.brand}</p>
      </footer>
    </article>
  );
}

function Minimal({ m }: { m: InvoiceModel }) {
  return (
    <article className="mx-auto w-full max-w-2xl bg-white p-6 text-black sm:p-10 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-black pb-3">
        <p className="text-xl font-semibold">{m.shop.name}</p>
        <p className="text-sm whitespace-nowrap">Bill {m.number}</p>
      </header>
      <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm">
        <div>
          {m.customer.name ?? "Walk-in customer"}
          {m.customer.mobile && <span> · {m.customer.mobile}</span>}
        </div>
        <div className="whitespace-nowrap">
          {m.date}, {m.time}
        </div>
      </div>
      <ul className="mt-6 text-sm">
        {m.rows.map((r) => (
          <li key={r.n} className="flex items-baseline gap-3 border-b border-neutral-300 py-2">
            <span className="min-w-0 flex-1">
              {r.name} <span className="text-neutral-500">{r.size}</span>
            </span>
            <span className="w-24 text-right text-neutral-600 tabular-nums">
              {r.quantity} × {r.rate}
            </span>
            <span className="w-20 text-right tabular-nums">{r.amount}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 ml-auto w-full max-w-xs text-sm">
        <Row label="Subtotal" value={m.subtotal} className="py-0.5" />
        {m.discount && <Row label={m.discount.label} value={m.discount.amount} className="py-0.5" />}
        {m.delivery && <Row label="Delivery" value={m.delivery} className="py-0.5" />}
        <Row label={<span className="font-semibold">Total</span>} value={<span className="font-semibold">{m.total}</span>} className="mt-1 border-t border-black pt-1.5" />
        <Row label={m.payment.due ? (m.payment.dueLabel ?? "Due") : "Payment"} value={m.payment.due ?? `${m.payment.status}, ${m.payment.method}`} className="py-0.5" />
      </div>
      <p className="mt-10 text-center text-xs">Thank you · {m.shop.phone}</p>
    </article>
  );
}
