"use server";

import { getCustomerSession } from "@/lib/customer-portal/session";
import { createReturnRequestSchema } from "@/lib/validation/return-request";
import { createReturnRequest, type CreateReturnRequestError } from "@/server/commerce/returns";

export type CreateReturnRequestActionResult =
  | { success: true; returnRequestId: string; returnNumber: string }
  | {
      success: false;
      error:
        | { type: "UNAUTHORIZED"; message: string }
        | { type: "VALIDATION"; message: string }
        | CreateReturnRequestError;
    };

/**
 * The one Server Action a future return/exchange form calls. `customerId`
 * is resolved HERE, from the verified session — never accepted as part of
 * `input` — before being handed to `createReturnRequest`
 * (src/server/commerce/returns.ts), which itself performs no
 * authorization of its own (see that function's doc comment). This is
 * the exact same shape as every other customer-portal action (Phase 3.4):
 * resolve the session first, reject before ever touching `input` if it's
 * missing.
 */
export async function createReturnRequestAction(input: unknown): Promise<CreateReturnRequestActionResult> {
  const session = await getCustomerSession();
  if (!session || !session.customer) {
    return {
      success: false,
      error: { type: "UNAUTHORIZED", message: "Please verify your mobile number again." },
    };
  }

  const parsed = createReturnRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: "Please check the selected items and try again." },
    };
  }

  return createReturnRequest({
    customerId: session.customer.id,
    orderNumber: parsed.data.orderNumber,
    type: parsed.data.type,
    note: parsed.data.note,
    items: parsed.data.items,
  });
}
