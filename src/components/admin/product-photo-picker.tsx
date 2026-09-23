"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadProductPhotoAction } from "@/server/actions/admin/product-photos";

/** Storefront tiles are square, so photos are centre-cropped to a square
 * and shrunk to this size on the phone before upload. */
const OUTPUT_SIZE = 800;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    // Older browsers without createImageBitmap options: fall back to <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Centre-crops to a square, resizes to 800×800 and re-encodes as WebP
 * (JPEG where the browser can't encode WebP, e.g. older iPhones). A
 * 4 MB camera photo becomes ~50–150 KB — quick on shop Wi-Fi or 4G. */
async function shrinkPhoto(file: File): Promise<Blob> {
  const { source, width, height } = await decode(file);
  const side = Math.min(width, height);
  const out = Math.min(OUTPUT_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, out, out);
  if ("close" in source) source.close();

  const webp = await toBlob(canvas, "image/webp", 0.82);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

/**
 * Product photo field for the admin product form: take a photo with the
 * camera or pick one from the gallery. Uploads immediately and reports the
 * stored URL through `onChange`; the product itself is saved with the form.
 */
export function ProductPhotoPicker({
  value,
  onChange,
  productName,
  onUploadingChange,
}: {
  value: string;
  onChange: (url: string) => void;
  productName: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  function setBusy(busy: boolean) {
    setUploading(busy);
    onUploadingChange?.(busy);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same photo again should still fire
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await shrinkPhoto(file);
      } catch {
        setError("Couldn't read that photo. Please try another one.");
        return;
      }
      const formData = new FormData();
      formData.append("photo", blob, blob.type === "image/webp" ? "photo.webp" : "photo.jpg");
      const result = await uploadProductPhotoAction(formData);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setBroken(false);
      onChange(result.url);
    } catch {
      setError("Upload failed. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  const hasPhoto = value !== "" && !broken;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="relative size-36 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded/bundled photo, same as the storefront thumbnail
          <img
            src={value}
            alt={productName ? `Photo of ${productName}` : "Product photo"}
            className="size-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <button
            type="button"
            onClick={() => galleryInput.current?.click()}
            disabled={uploading}
            className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground hover:bg-secondary/60"
          >
            <ImageIcon className="size-7" aria-hidden />
            <span className="text-xs">No photo yet</span>
          </button>
        )}
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/80 text-sm">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Uploading…
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={uploading}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera className="size-4" aria-hidden />
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={uploading}
            onClick={() => galleryInput.current?.click()}
          >
            <ImageIcon className="size-4" aria-hidden />
            Choose from gallery
          </Button>
          {hasPhoto && (
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-muted-foreground hover:text-destructive"
              disabled={uploading}
              onClick={() => onChange("")}
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Photos are cropped to a square from the centre, so keep the product in the middle. Tap &ldquo;Save
          changes&rdquo; afterwards to keep it.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {/* capture opens the rear camera directly on phones; without it the
          phone offers its gallery / files picker. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}
