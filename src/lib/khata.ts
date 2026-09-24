import { formatPaise } from "@/lib/money";

/** How customers pay off udhaar at the counter. */
export const KHATA_PAYMENT_METHODS = ["CASH", "UPI", "CARD"] as const;
export type KhataPaymentMethod = (typeof KHATA_PAYMENT_METHODS)[number];

export const KHATA_PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  CASH_ON_DELIVERY: "Cash on delivery",
};

/** One line in a customer's khata. `+` entries add to what they owe
 * (udhaar diya), `−` entries reduce it (paisa mila). */
export type KhataEventLike = {
  type: "BILL" | "UDHAAR" | "OPENING" | "PAYMENT";
  date: Date;
  amountInPaise: number;
  note: string | null;
  orderNumber: string | null;
  paymentMethod: string | null;
};

export function khataEventLabel(event: KhataEventLike): string {
  switch (event.type) {
    case "OPENING":
      return "Purana udhaar";
    case "UDHAAR":
      return event.note ? `Udhaar · ${event.note}` : "Udhaar";
    case "BILL":
      return `Bill udhaar · ${event.orderNumber}`;
    case "PAYMENT":
      return `Paisa mila · ${KHATA_PAYMENT_METHOD_LABEL[event.paymentMethod ?? ""] ?? "Cash"}`;
  }
}

export function khataEventSign(event: KhataEventLike): 1 | -1 {
  return event.type === "PAYMENT" ? -1 : 1;
}

const FULL_DAY = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/** Polite Hinglish payment reminder — the message a shopkeeper would
 * type themselves on WhatsApp. */
export function buildKhataReminderText(params: {
  shopName: string;
  shopPhone: string;
  customerName: string | null;
  dueInPaise: number;
}): string {
  const greeting = params.customerName ? `Namaste ${params.customerName} ji,` : "Namaste,";
  return [
    greeting,
    `${params.shopName} par aapka ${formatPaise(params.dueInPaise)} baaki hai.`,
    "Suvidha anusaar jama kar dein. UPI ya cash, dono chalega.",
    "",
    `Dhanyavaad 🙏`,
    `${params.shopName}, ${params.shopPhone}`,
  ].join("\n");
}

/** The customer's hisaab to send on WhatsApp: recent entries, oldest
 * first, and the balance. */
export function buildKhataStatementText(params: {
  shopName: string;
  customerName: string | null;
  /** Newest first, as on the customer page. */
  events: KhataEventLike[];
  dueInPaise: number;
  now?: Date;
  maxEntries?: number;
}): string {
  const recent = params.events.slice(0, params.maxEntries ?? 10).reverse();
  const lines = [
    params.customerName ? `Namaste ${params.customerName} ji,` : "Namaste,",
    `${params.shopName} ka hisaab, ${FULL_DAY.format(params.now ?? new Date())} tak:`,
    "",
  ];
  for (const event of recent) {
    const sign = khataEventSign(event) > 0 ? "+" : "-";
    lines.push(`${DAY.format(event.date)} - ${khataEventLabel(event)} - ${sign}${formatPaise(event.amountInPaise)}`);
  }
  if (recent.length > 0) lines.push("");
  lines.push(
    params.dueInPaise > 0 ? `Kul baaki: ${formatPaise(params.dueInPaise)}` : "Kul baaki: kuch nahi, hisaab barabar",
    "",
    "Koi galti lage to batayein. Dhanyavaad 🙏",
  );
  return lines.join("\n");
}

/** "Due for 12 days" — how long the oldest unpaid udhaar has been open. */
export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}
