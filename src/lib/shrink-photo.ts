/**
 * Shrinks a camera/gallery photo in the browser before upload, so a 4 MB
 * phone photo becomes ~50–300 KB — quick on shop Wi-Fi or 4G and well
 * under the Server Action body limit. Re-encodes as WebP (JPEG where the
 * browser can't encode WebP, e.g. older iPhones).
 *
 * - `square`: centre-crop to a square of `maxSide` (product tiles).
 * - otherwise: keep the shape, long edge at most `maxSide` (bill photos,
 *   where every line of the paper must stay readable).
 */
export async function shrinkPhoto(file: File, { maxSide, square }: { maxSide: number; square: boolean }): Promise<Blob> {
  const { source, width, height } = await decode(file);

  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  let outW: number;
  let outH: number;
  if (square) {
    const side = Math.min(width, height);
    sx = (width - side) / 2;
    sy = (height - side) / 2;
    sw = sh = side;
    outW = outH = Math.min(maxSide, side);
  } else {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    outW = Math.round(width * scale);
    outH = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  if ("close" in source) source.close();

  const webp = await toBlob(canvas, "image/webp", 0.82);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    // Older browsers without createImageBitmap options: fall back to <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}
