"use server";

import { getAdminSession } from "@/lib/admin/session";
import { saveProductPhoto, type SaveProductPhotoResult } from "@/server/product-photos";

/** Admin product form: upload a photo the owner took or picked. Takes
 * FormData with a single `photo` file (already shrunk on the phone). */
export async function uploadProductPhotoAction(formData: FormData): Promise<SaveProductPhotoResult> {
  const admin = await getAdminSession();
  if (!admin) return { success: false, message: "Please sign in again." };

  const file = formData.get("photo");
  if (!(file instanceof File)) return { success: false, message: "Please choose a photo." };

  return saveProductPhoto(new Uint8Array(await file.arrayBuffer()));
}
