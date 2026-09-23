import "server-only";
import { headers } from "next/headers";

/**
 * Pre-deployment hardening (2026-08-10) — the one place this codebase
 * resolves a caller's IP address, for admin-login rate limiting only
 * (src/server/actions/admin/auth.ts). No `NextRequest.ip` exists in this
 * Next.js version (removed years ago in favor of reading the standard
 * proxy header directly) and Server Actions receive no request object at
 * all — `headers()` from `next/headers` is the only way to read it here.
 *
 * `x-forwarded-for` is a comma-separated hop list (client, then each
 * proxy it passed through) when set by a reverse proxy/load balancer/CDN
 * — the FIRST entry is the original client. Falls back to a fixed
 * placeholder when the header is absent (e.g. a bare `next start` with
 * no reverse proxy in front, as in local development) — this makes every
 * such request share ONE rate-limit bucket, which fails toward MORE
 * restrictive rather than silently disabling the limit entirely. A real
 * deployment must sit behind a proxy that sets this header for accurate
 * per-client limiting — this is a standard requirement, not unique to
 * this app.
 */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headerList.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}
