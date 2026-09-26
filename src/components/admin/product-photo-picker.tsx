"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { uploadProductPhotoAction } from "@/server/actions/admin/product-photos";

/** Storefront tiles are square, so photos are centre-cropped to a square
 * and shrunk to this size on the phone before upload. */
const OUTPUT_SIZE = 800;

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
        blob = await shrinkPhoto(file, { maxSide: OUTPUT_SIZE, square: true });
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
          Keep the product in the middle; the photo is cropped to a square. It&apos;s kept when you save.
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
