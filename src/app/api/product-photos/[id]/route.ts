import { getProductPhoto } from "@/server/product-photos";

/** Serves an admin-uploaded product photo. A photo row never changes (a
 * new upload gets a new id), so it can be cached forever. */
export async function GET(_request: Request, ctx: RouteContext<"/api/product-photos/[id]">) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{1,40}$/.test(id)) return new Response("Not found", { status: 404 });

  const photo = await getProductPhoto(id);
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
