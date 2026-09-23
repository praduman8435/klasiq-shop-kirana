import { describe, expect, it } from "vitest";
import { computePaymentOutcome, derivePaymentStatus } from "@/lib/payment";

describe("computePaymentOutcome — FULL mode", () => {
  it("receives exactly the Grand Total, zero outstanding, PAID", () => {
    const result = computePaymentOutcome({ grandTotalInPaise: 135000, payment: { mode: "FULL" } });
    expect(result).toEqual({
      success: true,
      outcome: { amountReceivedInPaise: 135000, outstandingInPaise: 0, paymentStatus: "PAID" },
    });
  });

  it("ignores any input amount — there is none to ignore, by construction", () => {
    // FULL mode's type has no amountReceivedInPaise field at all — this
    // test just re-confirms the received amount always equals whatever
    // Grand Total is passed, regardless of its value.
    const result = computePaymentOutcome({ grandTotalInPaise: 0, payment: { mode: "FULL" } });
    expect(result).toEqual({
      success: true,
      outcome: { amountReceivedInPaise: 0, outstandingInPaise: 0, paymentStatus: "PAID" },
    });
  });
});

describe("computePaymentOutcome — PARTIAL mode", () => {
  it("computes outstanding as Grand Total minus received", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 135000,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 50000 },
    });
    expect(result).toEqual({
      success: true,
      outcome: { amountReceivedInPaise: 50000, outstandingInPaise: 85000, paymentStatus: "PARTIALLY_PAID" },
    });
  });

  it("a received amount of exactly the Grand Total yields zero outstanding and PAID", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 135000,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 135000 },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome.outstandingInPaise).toBe(0);
    expect(result.outcome.paymentStatus).toBe("PAID");
  });

  it("a received amount of zero is a valid PARTIAL outcome (full credit) — never rejected", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 135000,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 0 },
    });
    expect(result).toEqual({
      success: true,
      outcome: { amountReceivedInPaise: 0, outstandingInPaise: 135000, paymentStatus: "UNPAID" },
    });
  });

  it("rejects a negative received amount", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 135000,
      payment: { mode: "PARTIAL", amountReceivedInPaise: -100 },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_AMOUNT");
  });

  it("rejects a non-integer received amount", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 135000,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 500.5 },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_AMOUNT");
  });

  it("rejects a received amount exceeding the Grand Total", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 135000,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 135001 },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("EXCEEDS_GRAND_TOTAL");
  });

  it("rejects any positive received amount against a zero Grand Total", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 0,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 1 },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("EXCEEDS_GRAND_TOTAL");
  });

  it("accepts a zero received amount against a zero Grand Total (PAID, nothing owed)", () => {
    const result = computePaymentOutcome({
      grandTotalInPaise: 0,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 0 },
    });
    expect(result).toEqual({
      success: true,
      outcome: { amountReceivedInPaise: 0, outstandingInPaise: 0, paymentStatus: "PAID" },
    });
  });
});

describe("derivePaymentStatus", () => {
  it("PAID when received meets or exceeds the Grand Total", () => {
    expect(derivePaymentStatus(1000, 1000)).toBe("PAID");
    expect(derivePaymentStatus(1500, 1000)).toBe("PAID");
  });

  it("UNPAID when nothing (or less than nothing) has been received", () => {
    expect(derivePaymentStatus(0, 1000)).toBe("UNPAID");
  });

  it("PARTIALLY_PAID for anything strictly between zero and the Grand Total", () => {
    expect(derivePaymentStatus(1, 1000)).toBe("PARTIALLY_PAID");
    expect(derivePaymentStatus(999, 1000)).toBe("PARTIALLY_PAID");
  });

  it("a zero Grand Total with zero received is PAID, not UNPAID", () => {
    expect(derivePaymentStatus(0, 0)).toBe("PAID");
  });
});
