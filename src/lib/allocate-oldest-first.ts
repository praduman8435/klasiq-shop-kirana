/**
 * Splits a payment across unpaid bills/udhaar, oldest first — how a
 * shopkeeper actually thinks about it ("purana pehle"). Used for supplier
 * payments and KhataBook collections. `bills` must already be in
 * oldest-first order. Anything left over after every bill is cleared is
 * returned as `advanceInPaise`, never allocated.
 */
export function allocateOldestFirst(
  amountInPaise: number,
  bills: { id: string; outstandingInPaise: number }[],
): { allocations: { purchaseId: string; amountInPaise: number }[]; advanceInPaise: number } {
  let remaining = amountInPaise;
  const allocations: { purchaseId: string; amountInPaise: number }[] = [];
  for (const bill of bills) {
    if (remaining <= 0) break;
    if (bill.outstandingInPaise <= 0) continue;
    const take = Math.min(remaining, bill.outstandingInPaise);
    allocations.push({ purchaseId: bill.id, amountInPaise: take });
    remaining -= take;
  }
  return { allocations, advanceInPaise: remaining };
}
