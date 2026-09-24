import { formatPaise } from "@/lib/money";
import { normalizePhoneNumber } from "@/lib/phone";
import { OPENING_BALANCE_REFERENCE } from "@/lib/supplier-balance";

export type KhataEntryLike = {
  date: Date;
  type: "PURCHASE" | "PAYMENT" | "CREDIT" | "REFUND";
  reference: string | null;
  /** From the ledger: for a payment/refund, "Method · Person". */
  description: string;
  debitInPaise: number;
  creditInPaise: number;
};

/** How one khata row reads to a shopkeeper: "Bill #A-123",
 * "Paid · UPI", "Credit note #3", "Refund received · Cash". */
export function khataEntryLabel(entry: KhataEntryLike): string {
  const method = entry.description.split(" · ")[0];
  switch (entry.type) {
    case "PURCHASE":
      if (entry.reference === OPENING_BALANCE_REFERENCE) return "Opening balance";
      return entry.reference ? `Bill ${entry.reference.startsWith("#") ? "" : "#"}${entry.reference}` : "Bill";
    case "PAYMENT":
      return `Paid · ${method}`;
    case "CREDIT":
      return entry.reference ? `Credit note ${entry.reference}` : "Credit note";
    case "REFUND":
      return `Refund received · ${method}`;
  }
}

/** Amount shown on a khata row, signed the way the balance moves. */
export function khataEntryAmountInPaise(entry: KhataEntryLike): number {
  return entry.debitInPaise - entry.creditInPaise;
}

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const FULL_DAY = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * The account statement a shopkeeper sends a supplier on WhatsApp to
 * settle the hisaab: recent entries, totals and the balance, in plain
 * words the supplier can check against their own book.
 */
export function buildSupplierStatementText(params: {
  shopName: string;
  supplierName: string;
  /** Newest first, as on the supplier page. */
  entries: KhataEntryLike[];
  balanceInPaise: number;
  totalBillsInPaise: number;
  totalPaidInPaise: number;
  now?: Date;
  maxEntries?: number;
}): string {
  const { shopName, supplierName, balanceInPaise, totalBillsInPaise, totalPaidInPaise } = params;
  const recent = params.entries.slice(0, params.maxEntries ?? 10).reverse();

  const balanceLine =
    balanceInPaise > 0
      ? `Balance: ${formatPaise(balanceInPaise)} payable to you`
      : balanceInPaise < 0
        ? `Balance: ${formatPaise(-balanceInPaise)} advance with you`
        : "Balance: all settled";

  const lines = [
    `Namaste ${supplierName} ji,`,
    `Account statement (hisaab) from ${shopName}, up to ${FULL_DAY.format(params.now ?? new Date())}.`,
    "",
  ];
  if (recent.length > 0) {
    lines.push(params.entries.length > recent.length ? "Recent entries:" : "Entries:");
    for (const entry of recent) {
      const amount = khataEntryAmountInPaise(entry);
      lines.push(`${DAY.format(entry.date)} - ${khataEntryLabel(entry)} - ${formatPaise(Math.abs(amount))}`);
    }
    lines.push("");
  }
  lines.push(`Total bills: ${formatPaise(totalBillsInPaise)}`, `Total paid: ${formatPaise(totalPaidInPaise)}`, balanceLine);
  lines.push("", "Please check and tell us if anything doesn't match. Thank you.");
  return lines.join("\n");
}

/** A wa.me link that opens WhatsApp with `text` ready to send — to the
 * supplier's number when it's a valid Indian mobile, otherwise WhatsApp
 * lets the shopkeeper pick the chat. */
export function whatsAppLink(phone: string | null | undefined, text?: string): string {
  const normalized = phone ? normalizePhoneNumber(phone) : { valid: false as const };
  const base = normalized.valid ? `https://wa.me/${normalized.normalized.replace("+", "")}` : "https://wa.me/";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** tel: link for the Call button, or null when there's no usable number. */
export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = normalizePhoneNumber(phone);
  return normalized.valid ? `tel:${normalized.normalized}` : `tel:${phone.replace(/[^\d+]/g, "")}`;
}
