import { describe, expect, it } from "vitest";
import {
  EMPTY_ADDRESS_SNAPSHOT,
  isBlankAddressSnapshot,
  resolveCounterSaleAddressSnapshot,
} from "@/lib/counter-sale-address";

const SAVED = { addressLine: "12 Park Road", city: "Pune", state: "Maharashtra", pincode: "411001" };

describe("resolveCounterSaleAddressSnapshot", () => {
  it("NONE always resolves to the empty snapshot, regardless of any saved address", () => {
    expect(resolveCounterSaleAddressSnapshot({ address: { mode: "NONE" }, savedAddress: SAVED })).toEqual(
      EMPTY_ADDRESS_SNAPSHOT,
    );
    expect(resolveCounterSaleAddressSnapshot({ address: { mode: "NONE" }, savedAddress: null })).toEqual(
      EMPTY_ADDRESS_SNAPSHOT,
    );
  });

  it("SAVED returns exactly the given saved address, untouched", () => {
    expect(resolveCounterSaleAddressSnapshot({ address: { mode: "SAVED" }, savedAddress: SAVED })).toEqual(SAVED);
  });

  it("SAVED with no saved address on file falls back to the empty snapshot rather than throwing", () => {
    expect(resolveCounterSaleAddressSnapshot({ address: { mode: "SAVED" }, savedAddress: null })).toEqual(
      EMPTY_ADDRESS_SNAPSHOT,
    );
  });

  it("ONE_TIME uses exactly the given fields, independent of any saved address", () => {
    const result = resolveCounterSaleAddressSnapshot({
      address: { mode: "ONE_TIME", addressLine: "1 Guest Lane", city: "Mumbai", state: "MH", pincode: "400001" },
      savedAddress: SAVED,
    });
    expect(result).toEqual({ addressLine: "1 Guest Lane", city: "Mumbai", state: "MH", pincode: "400001" });
  });

  it("ONE_TIME trims whitespace and converts blank fields to null", () => {
    const result = resolveCounterSaleAddressSnapshot({
      address: { mode: "ONE_TIME", addressLine: "  1 Guest Lane  ", city: "   ", state: undefined, pincode: "" },
      savedAddress: null,
    });
    expect(result).toEqual({ addressLine: "1 Guest Lane", city: null, state: null, pincode: null });
  });

  it("a fully blank ONE_TIME entry resolves to the same empty snapshot as NONE (section 3: no validation, blank is fine)", () => {
    const result = resolveCounterSaleAddressSnapshot({
      address: { mode: "ONE_TIME" },
      savedAddress: SAVED,
    });
    expect(result).toEqual(EMPTY_ADDRESS_SNAPSHOT);
  });

  it("never returns the saved address for ONE_TIME, even when the typed fields happen to be empty and a saved address exists", () => {
    // Guards against a future refactor accidentally falling back to
    // savedAddress for ONE_TIME — the two modes must stay independent.
    const result = resolveCounterSaleAddressSnapshot({
      address: { mode: "ONE_TIME" },
      savedAddress: SAVED,
    });
    expect(result).not.toEqual(SAVED);
  });
});

describe("isBlankAddressSnapshot", () => {
  it("is true for the empty snapshot", () => {
    expect(isBlankAddressSnapshot(EMPTY_ADDRESS_SNAPSHOT)).toBe(true);
  });

  it("is false when any single field is present", () => {
    expect(isBlankAddressSnapshot({ addressLine: null, city: null, state: null, pincode: "411001" })).toBe(false);
  });

  it("is false for a fully populated snapshot", () => {
    expect(isBlankAddressSnapshot(SAVED)).toBe(false);
  });
});
