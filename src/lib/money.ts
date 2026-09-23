const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Formats integer paise (e.g. 35000) as a rupee display string (e.g. "₹350"). */
export function formatPaise(paise: number): string {
  return INR_FORMATTER.format(paise / 100);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
