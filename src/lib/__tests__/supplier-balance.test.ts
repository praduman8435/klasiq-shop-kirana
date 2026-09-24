import { describe, expect, it } from "vitest";
import {
  allocateOldestFirst,
  describeSupplierBalance,
  netSupplierBalanceInPaise,
  startOfMonthInIndia,
} from "@/lib/supplier-balance";

describe("netSupplierBalanceInPaise", () => {
  it("is bills minus payments and credits, plus refunds", () => {
    expect(
      netSupplierBalanceInPaise({ purchasesInPaise: 10000, paymentsInPaise: 3000, creditsInPaise: 2000, refundsInPaise: 500 }),
    ).toBe(5500);
  });

  it("a refund of an overpayment brings the balance back to zero", () => {
    expect(
      netSupplierBalanceInPaise({ purchasesInPaise: 1000, paymentsInPaise: 1200, creditsInPaise: 0, refundsInPaise: 200 }),
    ).toBe(0);
  });
});

describe("describeSupplierBalance", () => {
  it("labels what's owed, an advance, and settled", () => {
    expect(describeSupplierBalance(450000)).toMatchObject({ tone: "owe", hint: "Dena hai", amountInPaise: 450000 });
    expect(describeSupplierBalance(-20000)).toMatchObject({ tone: "advance", hint: "Lena hai", amountInPaise: 20000 });
    expect(describeSupplierBalance(0)).toMatchObject({ tone: "settled", label: "All paid", hint: "Hisaab barabar" });
  });
});

describe("allocateOldestFirst", () => {
  const bills = [
    { id: "old", outstandingInPaise: 1000 },
    { id: "mid", outstandingInPaise: 2000 },
    { id: "new", outstandingInPaise: 3000 },
  ];

  it("clears the oldest bills first and part-pays the next", () => {
    expect(allocateOldestFirst(2500, bills)).toEqual({
      allocations: [
        { purchaseId: "old", amountInPaise: 1000 },
        { purchaseId: "mid", amountInPaise: 1500 },
      ],
      advanceInPaise: 0,
    });
  });

  it("keeps anything beyond every bill as an advance", () => {
    const result = allocateOldestFirst(7000, bills);
    expect(result.allocations.map((a) => a.amountInPaise)).toEqual([1000, 2000, 3000]);
    expect(result.advanceInPaise).toBe(1000);
  });

  it("with no unpaid bills the whole payment is an advance", () => {
    expect(allocateOldestFirst(500, [])).toEqual({ allocations: [], advanceInPaise: 500 });
  });
});

describe("startOfMonthInIndia", () => {
  it("is midnight on the 1st, India time", () => {
    // 1 Oct 2026 03:00 IST is still 30 Sep in UTC — must count as October.
    expect(startOfMonthInIndia(new Date("2026-09-30T21:30:00Z")).toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(startOfMonthInIndia(new Date("2026-09-24T10:00:00Z")).toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });
});
