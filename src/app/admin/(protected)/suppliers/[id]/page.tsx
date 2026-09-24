import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  ScrollText,
  Undo2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BALANCE_TONE_CLASS } from "@/components/admin/supplier-balance";
import { BRAND } from "@/lib/constants";
import { formatPaise } from "@/lib/money";
import { describeSupplierBalance } from "@/lib/supplier-balance";
import {
  buildSupplierStatementText,
  khataEntryAmountInPaise,
  khataEntryLabel,
  telLink,
  whatsAppLink,
} from "@/lib/supplier-statement";
import { cn } from "@/lib/utils";
import { getSupplierKhata } from "@/server/queries/admin/supplier-ledger";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";

type PageProps = { params: Promise<{ id: string }> };

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const YEAR = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" });

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  return { title: supplier?.name ?? "Supplier" };
}

/**
 * One supplier, like a party page in a billing app: what you owe in one
 * number, the two things you do most (note a bill, pay), call/WhatsApp,
 * and the khata underneath with a running balance. Everything else is
 * one tap away at the bottom.
 */
export default async function AdminSupplierPage({ params }: PageProps) {
  const { id } = await params;
  const [supplier, khata] = await Promise.all([getAdminSupplierById(id), getSupplierKhata(id, 30)]);
  if (!supplier) notFound();

  const balance = describeSupplierBalance(khata.balanceInPaise);
  const call = telLink(supplier.phone);
  const statement = buildSupplierStatementText({
    shopName: BRAND.legacyStoreNames[0] ?? BRAND.name,
    supplierName: supplier.name,
    entries: khata.entries,
    balanceInPaise: khata.balanceInPaise,
    totalBillsInPaise: khata.totalBillsInPaise,
    totalPaidInPaise: khata.totalPaidInPaise,
  });
  const details = [supplier.businessName !== supplier.name ? supplier.businessName : null, supplier.city]
    .filter(Boolean)
    .join(" · ");
  const thisYear = YEAR.format(new Date());

  const otherEntries = (
    <section aria-label="Other entries" className="border-t border-border pt-4">
      <h2 className="text-sm font-semibold">
        Other entries
      </h2>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
        <li>
          <Link
            href={`/admin/suppliers/${id}/credits/new`}
            className="flex h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <ReceiptText className="size-4" aria-hidden />
            Supplier gave money off
          </Link>
        </li>
        <li>
          <Link
            href={`/admin/suppliers/${id}/refunds/new`}
            className="flex h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <Undo2 className="size-4" aria-hidden />
            Supplier gave money back
          </Link>
        </li>
        <li>
          <Link
            href={`/admin/suppliers/${id}/ledger`}
            className="flex h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <ScrollText className="size-4" aria-hidden />
            Full khata, filter & print
          </Link>
        </li>
        {supplier.notes && (
          <li className="flex items-start gap-2 px-2 py-3 text-sm text-muted-foreground sm:col-span-2">
            <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="whitespace-pre-line">{supplier.notes}</span>
          </li>
        )}
      </ul>
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 lg:max-w-6xl">
      <Link
        href="/admin/suppliers"
        className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Suppliers
      </Link>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <header className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold"
            >
              {supplier.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-xl font-semibold tracking-tight">{supplier.name}</h1>
                {!supplier.isActive && (
                  <Badge variant="outline" className="border-border text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {[details, supplier.phone].filter(Boolean).join(" · ") || "Add a phone number to call or WhatsApp"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
                {call && (
                  <Button render={<a href={call} />} nativeButton={false} variant="outline" className="h-10">
                    <Phone className="size-4" aria-hidden />
                    Call
                  </Button>
                )}
                {supplier.phone && (
                  <Button
                    render={<a href={whatsAppLink(supplier.phone)} target="_blank" rel="noopener noreferrer" />}
                    nativeButton={false}
                    variant="outline"
                    className="h-10"
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    WhatsApp
                  </Button>
                )}
              </div>
            </div>
            <Button
              render={<Link href={`/admin/suppliers/${id}/edit`} aria-label="Edit supplier details" />}
              nativeButton={false}
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 text-muted-foreground"
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          </header>

          <section aria-labelledby="balance-heading" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <p id="balance-heading" className="text-sm text-muted-foreground">
              {balance.tone === "owe" ? "To pay · Dena hai" : balance.tone === "advance" ? "You paid extra · Lena hai" : "Hisaab barabar"}
            </p>
            <p className={cn("mt-1 text-4xl font-semibold tabular-nums", BALANCE_TONE_CLASS[balance.tone])}>
              {balance.tone === "settled" ? "All paid" : formatPaise(balance.amountInPaise)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bills {formatPaise(khata.totalBillsInPaise)} · Paid {formatPaise(khata.totalPaidInPaise)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                render={<Link href={`/admin/suppliers/${id}/purchases/new`} />}
                nativeButton={false}
                variant="outline"
                className="h-12 flex-col gap-0 text-base"
              >
                <span className="flex items-center gap-1.5">
                  <Plus className="size-4" aria-hidden />
                  New bill
                </span>
                <span className="text-xs font-normal text-muted-foreground">Maal aaya</span>
              </Button>
              <Button
                render={<Link href={`/admin/suppliers/${id}/payments/new`} />}
                nativeButton={false}
                className="h-12 flex-col gap-0 text-base"
              >
                <span className="flex items-center gap-1.5">
                  <Wallet className="size-4" aria-hidden />
                  Pay
                </span>
                <span className="text-xs font-normal opacity-80">Paisa diya</span>
              </Button>
            </div>

            {khata.totalCount > 0 && (
              <Button
                render={<a href={whatsAppLink(supplier.phone, statement)} target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
                variant="ghost"
                className="mt-2 h-10 w-full text-muted-foreground"
              >
                <MessageCircle className="size-4" aria-hidden />
                Send hisaab on WhatsApp
              </Button>
            )}
          </section>

          <div className="hidden lg:block">{otherEntries}</div>
        </div>
        <div className="flex flex-col gap-5">
          <section aria-labelledby="khata-heading">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="khata-heading" className="text-sm font-semibold">
                Khata · Hisaab
              </h2>
              {khata.totalCount > 0 && (
                <Link href={`/admin/suppliers/${id}/ledger`} className="text-sm text-muted-foreground hover:text-foreground">
                  Full khata{khata.totalCount > khata.entries.length ? ` (${khata.totalCount})` : ""} & print
                </Link>
              )}
            </div>

            {khata.entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm font-medium">No entries yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When goods arrive, tap <span className="text-foreground">New bill</span>. When you pay, tap{" "}
                  <span className="text-foreground">Pay</span>. The balance keeps itself up to date.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="hidden items-center gap-3 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground lg:flex">
                <span className="w-14 shrink-0">Date</span>
                <span className="min-w-0 flex-1">Entry</span>
                <span className="w-28 text-right">Amount</span>
                <span className="w-28 text-right">Balance</span>
                <span className="w-4 shrink-0" />
              </div>
              <ol className="divide-y divide-border">
                {khata.entries.map((entry) => {
                  const amount = khataEntryAmountInPaise(entry);
                  const date = DAY.format(entry.date);
                  const year = YEAR.format(entry.date);
                  return (
                    <li key={entry.key}>
                      <Link
                        href={entry.href}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                      >
                        <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {date}
                          {year !== thisYear && <span className="block">{year}</span>}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{khataEntryLabel(entry)}</span>
                        <span className="flex flex-col items-end lg:flex-row lg:items-center">
                          <span
                            className={cn(
                              "text-sm font-medium tabular-nums lg:w-28 lg:text-right",
                              amount > 0 ? "text-foreground" : "text-emerald-400",
                            )}
                          >
                            {amount > 0 ? "+" : "−"}
                            {formatPaise(Math.abs(amount))}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums lg:w-28 lg:text-right lg:text-sm">
                            <span className="lg:hidden">Bal </span>
                            {formatPaise(entry.balanceInPaise)}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ol>
              </div>
            )}
            {khata.entries.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                + adds to what you have to pay, − reduces it. Tap a bill to add its items to stock or return goods.
              </p>
            )}
          </section>

          <div className="lg:hidden">{otherEntries}</div>
        </div>
      </div>
    </div>
  );
}
