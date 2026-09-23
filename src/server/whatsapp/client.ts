import "server-only";
import { maskPhoneForLogging } from "@/lib/phone";

/**
 * The ONE low-level Meta WhatsApp Business Cloud API client this codebase
 * has — shared transport for both OTP delivery (`src/server/otp/whatsapp-provider.ts`)
 * and order-lifecycle notifications (`src/server/whatsapp/notification-service.ts`),
 * per Phase 3.6 Part 2 section 2 ("Do NOT create another Meta client").
 * Everything Meta-API-specific (endpoint shape, retry/duplicate-message
 * safety, error categorization, phone-number formatting) lives exactly
 * here, once. What stays deliberately OUTSIDE this file — credentials
 * resolution (`./config.ts`), which template/variables to send, and any
 * business-logic-level authorization or eligibility — is what keeps OTP
 * and notifications "logically separate" despite sharing this transport.
 */

const DEFAULT_API_VERSION = "v21.0";

// A network-level failure (connection refused/reset, DNS failure, request
// timeout) never reaches Meta's servers at all — retrying it can never
// produce a duplicate WhatsApp message, only a second attempt at a send
// that definitely didn't happen the first time. Bounded to exactly one
// retry (two attempts total). An actual HTTP response (even a 5xx) is
// NEVER retried — Meta having responded at all means the message may
// already be queued or delivered, so retrying risks a real duplicate
// landing on the customer's phone. See docs/PHASE_3_6_REPORT.md Part 1
// "Provider retries" (unchanged reasoning, now shared by both callers).
const MAX_SEND_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkLevelFailure(err: unknown): boolean {
  return err instanceof TypeError;
}

type MetaErrorBody = {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

/**
 * Extracts only a coarse, non-sensitive error category from Meta's
 * response — never the full body (which can include account/request
 * details), never anything derived from a template variable (which may
 * itself carry an OTP code or other sensitive content — see the caller's
 * own logging discipline). See "Logging" in docs/PHASE_3_6_REPORT.md.
 */
async function categorizeFailureResponse(response: Response): Promise<{ metaErrorCode?: number; metaErrorType?: string }> {
  try {
    const body = (await response.json()) as MetaErrorBody;
    return { metaErrorCode: body.error?.code, metaErrorType: body.error?.type };
  } catch {
    return {};
  }
}

export type WhatsAppTransportConfig = {
  apiToken: string;
  phoneNumberId: string;
  apiVersion?: string;
  /** Test-only override — never set in real deployment. */
  baseUrl?: string;
};

export type WhatsAppTemplateMessageParams = {
  /** E.164, with leading "+" (this codebase's own normalized form,
   * `src/lib/phone.ts`) — the leading "+" is stripped internally, since
   * that's a Meta API quirk callers shouldn't need to know about. */
  phoneNormalized: string;
  templateName: string;
  templateLanguage: string;
  /** Ordered — fills the template's {{1}}, {{2}}, ... in order. */
  bodyParameters: string[];
  /** Phase 3.6.6 Part 3 — an already-uploaded document to attach via the
   * template's own HEADER component (never a second message, never a raw
   * `type: "document"` message outside a template — every send in this
   * codebase remains a template message, consistent with every other
   * caller). Optional and additive: every existing caller (OTP, Order,
   * Return/Exchange) omits this, so its own request body is byte-for-byte
   * unchanged from before this field existed. Only the invoice-delivery
   * caller (`src/server/whatsapp/invoice-notification-service.ts`) sets
   * it. `mediaId` must already be a real id returned by
   * `uploadWhatsAppMedia` below — this function never uploads anything
   * itself. */
  headerDocument?: { mediaId: string; filename: string };
  /** A short, non-sensitive tag distinguishing WHICH caller/purpose this
   * send is for in the shared log lines below (e.g. `"otp"` or
   * `"order-notification:ORDER_CONFIRMED"`) — never itself sensitive,
   * never a template variable's actual value. */
  logLabel: string;
};

/**
 * Sends one WhatsApp template message via Meta's Cloud API
 * (`POST /{phoneNumberId}/messages`), with the exact retry/logging
 * discipline established in Phase 3.6 Part 1. Never throws anything but
 * a plain `Error` (never a raw fetch/Meta error object) — callers decide
 * for themselves whether that failure should be swallowed (notifications
 * always do) or surfaced as a generic customer-facing error (OTP does).
 */
export async function sendWhatsAppTemplateMessage(
  config: WhatsAppTransportConfig,
  params: WhatsAppTemplateMessageParams,
): Promise<void> {
  const baseUrl = config.baseUrl ?? `https://graph.facebook.com/${config.apiVersion ?? DEFAULT_API_VERSION}`;
  const url = `${baseUrl}/${config.phoneNumberId}/messages`;
  // Meta's Cloud API expects a bare E.164 number with no leading "+".
  const recipient = params.phoneNormalized.replace(/^\+/, "");

  const body = JSON.stringify({
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.templateLanguage },
      components: [
        ...(params.headerDocument
          ? [
              {
                type: "header",
                parameters: [
                  {
                    type: "document",
                    document: { id: params.headerDocument.mediaId, filename: params.headerDocument.filename },
                  },
                ],
              },
            ]
          : []),
        { type: "body", parameters: params.bodyParameters.map((text) => ({ type: "text", text })) },
      ],
    },
  });

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (response.ok) {
        // Personal-data audit (2026-08-10) — the phone number is masked
        // (src/lib/phone.ts's maskPhoneForLogging) before it ever reaches a
        // log line, never the raw E.164 value. Never a template
        // parameter's actual value either, which may be sensitive (e.g. an
        // OTP code) depending on the caller.
        console.log("whatsapp-client: message delivered", {
          logLabel: params.logLabel,
          phoneNormalized: maskPhoneForLogging(params.phoneNormalized),
        });
        return;
      }

      // A real response was received — never retry past this point.
      const category = await categorizeFailureResponse(response);
      console.error("whatsapp-client: message delivery failed", {
        logLabel: params.logLabel,
        phoneNormalized: maskPhoneForLogging(params.phoneNormalized),
        httpStatus: response.status,
        ...category,
      });
      throw new Error("WhatsApp message delivery failed");
    } catch (err) {
      if (isNetworkLevelFailure(err) && attempt < MAX_SEND_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      if (isNetworkLevelFailure(err)) {
        console.error("whatsapp-client: message delivery failed", {
          logLabel: params.logLabel,
          phoneNormalized: maskPhoneForLogging(params.phoneNormalized),
          reason: "network",
        });
      }
      throw err instanceof Error ? err : new Error("WhatsApp message delivery failed");
    }
  }
}

/**
 * Uploads a file to Meta's Cloud API media store
 * (`POST /{phoneNumberId}/media`), returning the opaque media `id` a
 * subsequent `sendWhatsAppTemplateMessage` call's `headerDocument.mediaId`
 * must reference. Phase 3.6.6 Part 3 — the ONE new low-level Meta
 * capability this phase adds, in the SAME shared client file (never a
 * second Meta client — section 2's "reuse the Meta client" applies to
 * extending this file, not forking it). Same retry/logging discipline as
 * `sendWhatsAppTemplateMessage` above: exactly one retry, only for a
 * genuine network-level failure; a received HTTP response (even a 5xx) is
 * never retried, since Meta may already have stored the file. Never logs
 * the file's own bytes — only its filename and byte size.
 */
export async function uploadWhatsAppMedia(
  config: WhatsAppTransportConfig,
  file: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const baseUrl = config.baseUrl ?? `https://graph.facebook.com/${config.apiVersion ?? DEFAULT_API_VERSION}`;
  const url = `${baseUrl}/${config.phoneNumberId}/media`;

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", mimeType);
      form.append("file", new Blob([new Uint8Array(file)], { type: mimeType }), filename);

      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiToken}` },
        body: form,
      });

      if (response.ok) {
        const data = (await response.json()) as { id?: string };
        if (!data.id) {
          throw new Error("WhatsApp media upload succeeded but returned no media id");
        }
        console.log("whatsapp-client: media uploaded", { filename, size: file.length });
        return data.id;
      }

      const category = await categorizeFailureResponse(response);
      console.error("whatsapp-client: media upload failed", {
        filename,
        httpStatus: response.status,
        ...category,
      });
      throw new Error("WhatsApp media upload failed");
    } catch (err) {
      if (isNetworkLevelFailure(err) && attempt < MAX_SEND_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      if (isNetworkLevelFailure(err)) {
        console.error("whatsapp-client: media upload failed", { filename, reason: "network" });
      }
      throw err instanceof Error ? err : new Error("WhatsApp media upload failed");
    }
  }
  throw new Error("WhatsApp media upload failed");
}
