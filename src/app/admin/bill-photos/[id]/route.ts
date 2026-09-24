import { getAdminSession } from "@/lib/admin/session";
import { getBillPhoto } from "@/server/supplier-bill-photos";

/** A supplier bill photo — private paperwork, so admin sign-in only.
 * Lives under /admin (not /api) because the admin session cookie is
 * scoped to the /admin path and is never sent anywhere else.
 * Rows never change, but the response is `private` so no shared cache
 * (CDN) ever keeps a copy. */
export async function GET(_request: Request, ctx: RouteContext<"/admin/bill-photos/[id]">) {
  const admin = await getAdminSession();
  if (!admin) return new Response("Not found", { status: 404 });

  const { id } = await ctx.params;
  if (!/^[a-z0-9]{1,40}$/.test(id)) return new Response("Not found", { status: 404 });

  const photo = await getBillPhoto(id);
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
