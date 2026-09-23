import { describe, expect, it } from "vitest";
import { validateReceivePaymentAmount } from "@/lib/receive-payment";

describe("validateReceivePaymentAmount", () => {
  it("accepts a valid partial payment", () => {
    expect(validateReceivePaymentAmount({ amountInPaise: 5000, outstandingInPaise: 10000 })).toBeNull();
  });

  it("accepts a payment that exactly clears the outstanding balance", () => {
    expect(validateReceivePaymentAmount({ amountInPaise: 10000, outstandingInPaise: 10000 })).toBeNull();
  });

  it("rejects a zero amount", () => {
    const error = validateReceivePaymentAmount({ amountInPaise: 0, outstandingInPaise: 10000 });
    expect(error?.type).toBe("INVALID_AMOUNT");
  });

  it("rejects a negative amount", () => {
    const error = validateReceivePaymentAmount({ amountInPaise: -500, outstandingInPaise: 10000 });
    expect(error?.type).toBe("INVALID_AMOUNT");
  });

  it("rejects a non-integer amount", () => {
    const error = validateReceivePaymentAmount({ amountInPaise: 100.5, outstandingInPaise: 10000 });
    expect(error?.type).toBe("INVALID_AMOUNT");
  });

  it("rejects an amount exceeding the outstanding balance", () => {
    const error = validateReceivePaymentAmount({ amountInPaise: 10001, outstandingInPaise: 10000 });
    expect(error?.type).toBe("EXCEEDS_OUTSTANDING");
  });

  it("reports ALREADY_PAID (not a generic overpayment) when outstanding is already zero", () => {
    const error = validateReceivePaymentAmount({ amountInPaise: 100, outstandingInPaise: 0 });
    expect(error?.type).toBe("ALREADY_PAID");
  });

  it("reports ALREADY_PAID even for a technically-invalid amount, when there's nothing to collect", () => {
    // Outstanding is checked first — "nothing left to collect" is the more
    // useful message than "enter a positive amount" when the order is
    // already fully paid.
    const error = validateReceivePaymentAmount({ amountInPaise: -1, outstandingInPaise: 0 });
    expect(error?.type).toBe("ALREADY_PAID");
  });
});
