/**
 * UPI "pay" links (the NPCI deep-link format every UPI app understands:
 * GPay, PhonePe, Paytm, BHIM…). Opening one on a phone launches the
 * customer's UPI app with the shop, amount and note filled in; the same
 * string encoded as a QR code can be scanned from another phone.
 *
 * There is no payment gateway, so the app never learns whether the
 * payment went through — the shop confirms it from its own UPI app.
 */
export function buildUpiPayLink(params: { upiId: string; payeeName: string; amountInPaise: number; note: string }): string {
  const query = new URLSearchParams({
    pa: params.upiId,
    pn: params.payeeName,
    am: (params.amountInPaise / 100).toFixed(2),
    cu: "INR",
    tn: params.note.slice(0, 50),
  });
  return `upi://pay?${query.toString().replace(/\+/g, "%20")}`;
}

/** A UPI ID looks like name@bank (letters, digits, dot, dash, underscore). */
export function isValidUpiId(value: string): boolean {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/.test(value);
}
