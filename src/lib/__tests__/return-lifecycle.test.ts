import { describe, expect, it } from "vitest";
import {
  RETURN_REASON_LABEL,
  RETURN_REQUEST_STATUS_LABEL,
  RETURN_WINDOW_DAYS,
  doesReturnStatusClaimQuantity,
  isTerminalReturnStatus,
  isValidReturnStatusTransition,
  nextValidReturnStatuses,
} from "@/lib/return-lifecycle";
import type { ReturnReason, ReturnRequestStatus } from "@prisma/client";

const ALL_STATUSES: ReturnRequestStatus[] = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "RECEIVED",
  "COMPLETED",
  "CANCELLED",
];

const ALL_REASONS: ReturnReason[] = [
  "WRONG_SIZE",
  "DEFECTIVE",
  "DAMAGED",
  "WRONG_PRODUCT",
  "QUALITY_ISSUE",
  "CHANGED_MIND",
  "OTHER",
];

describe("RETURN_WINDOW_DAYS", () => {
  it("is centralized as 7", () => {
    expect(RETURN_WINDOW_DAYS).toBe(7);
  });
});

describe("isValidReturnStatusTransition", () => {
  it("allows REQUESTED to move to APPROVED, REJECTED, or CANCELLED", () => {
    expect(isValidReturnStatusTransition({ from: "REQUESTED", to: "APPROVED" })).toBe(true);
    expect(isValidReturnStatusTransition({ from: "REQUESTED", to: "REJECTED" })).toBe(true);
    expect(isValidReturnStatusTransition({ from: "REQUESTED", to: "CANCELLED" })).toBe(true);
  });

  it("rejects REQUESTED moving directly to RECEIVED or COMPLETED", () => {
    expect(isValidReturnStatusTransition({ from: "REQUESTED", to: "RECEIVED" })).toBe(false);
    expect(isValidReturnStatusTransition({ from: "REQUESTED", to: "COMPLETED" })).toBe(false);
  });

  it("allows APPROVED to move to RECEIVED or CANCELLED", () => {
    expect(isValidReturnStatusTransition({ from: "APPROVED", to: "RECEIVED" })).toBe(true);
    expect(isValidReturnStatusTransition({ from: "APPROVED", to: "CANCELLED" })).toBe(true);
  });

  it("allows RECEIVED to move only to COMPLETED", () => {
    expect(isValidReturnStatusTransition({ from: "RECEIVED", to: "COMPLETED" })).toBe(true);
    expect(isValidReturnStatusTransition({ from: "RECEIVED", to: "CANCELLED" })).toBe(false);
  });

  it("treats REJECTED, COMPLETED, and CANCELLED as terminal — no valid transitions out", () => {
    expect(isTerminalReturnStatus("REJECTED")).toBe(true);
    expect(isTerminalReturnStatus("COMPLETED")).toBe(true);
    expect(isTerminalReturnStatus("CANCELLED")).toBe(true);
    expect(nextValidReturnStatuses("REJECTED")).toEqual([]);
    expect(nextValidReturnStatuses("COMPLETED")).toEqual([]);
    expect(nextValidReturnStatuses("CANCELLED")).toEqual([]);
  });

  it("REQUESTED, APPROVED, and RECEIVED are not terminal", () => {
    expect(isTerminalReturnStatus("REQUESTED")).toBe(false);
    expect(isTerminalReturnStatus("APPROVED")).toBe(false);
    expect(isTerminalReturnStatus("RECEIVED")).toBe(false);
  });
});

describe("doesReturnStatusClaimQuantity", () => {
  it("REQUESTED, APPROVED, RECEIVED, and COMPLETED all claim the quantity", () => {
    expect(doesReturnStatusClaimQuantity("REQUESTED")).toBe(true);
    expect(doesReturnStatusClaimQuantity("APPROVED")).toBe(true);
    expect(doesReturnStatusClaimQuantity("RECEIVED")).toBe(true);
    expect(doesReturnStatusClaimQuantity("COMPLETED")).toBe(true);
  });

  it("REJECTED and CANCELLED release the claim", () => {
    expect(doesReturnStatusClaimQuantity("REJECTED")).toBe(false);
    expect(doesReturnStatusClaimQuantity("CANCELLED")).toBe(false);
  });
});

describe("centralized labels", () => {
  it("has a label for every ReturnRequestStatus value", () => {
    for (const status of ALL_STATUSES) {
      expect(RETURN_REQUEST_STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it("has a label for every ReturnReason value", () => {
    for (const reason of ALL_REASONS) {
      expect(RETURN_REASON_LABEL[reason]).toBeTruthy();
    }
  });
});
