"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import {
  toScanErrorCode,
  type DocumentExtractionResult,
  type DocumentType,
  type ScanErrorCode,
} from "@/modules/documents/schemas/extraction";

/**
 * Capture -> extract. Mobile-first: this is used standing at a petrol pump,
 * so the camera is the primary action and everything else is secondary.
 *
 * Owns capture, client-side downscaling and the API call. It deliberately
 * does *not* know what a fuel receipt is — it hands the result to whichever
 * form embedded it, which is what lets the same component serve both modules.
 */

/** Anthropic downscales above roughly this on the long edge anyway, so
 * sending more costs upload time on a phone connection and buys nothing. */
const MAX_EDGE_PX = 1568;
const JPEG_QUALITY = 0.85;
const SUPPORTED = ["image/jpeg", "image/png", "image/webp"];
/** Mirrors MAX_IMAGE_BYTES on the server — checked here too so a 12MP photo
 * fails instantly instead of after a long upload. */
const MAX_BYTES = 10 * 1024 * 1024;

type Status = "idle" | "preparing" | "uploading";

interface DocumentScannerProps {
  documentType: Exclude<DocumentType, "UNKNOWN">;
  onExtracted: (result: DocumentExtractionResult) => void;
  disabled?: boolean;
}

/**
 * Re-encodes a capture down to something worth uploading.
 *
 * `imageOrientation: "from-image"` is load-bearing: without it a photo taken
 * in portrait arrives rotated, because the EXIF orientation flag is dropped
 * when the bitmap is drawn to a canvas. A sideways receipt extracts badly.
 *
 * Any failure falls back to the original file — a slower upload beats a
 * capture the user can't submit at all.
 */
async function prepareImage(file: File): Promise<{ blob: Blob; type: string }> {
  if (typeof createImageBitmap !== "function") {
    return { blob: file, type: file.type };
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, type: file.type };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    // Re-encoding to JPEG also rescues HEIC captures on browsers that can
    // decode them, which the server would otherwise reject.
    return blob ? { blob, type: "image/jpeg" } : { blob: file, type: file.type };
  } catch {
    return { blob: file, type: file.type };
  }
}

export function DocumentScanner({ documentType, onExtracted, disabled }: DocumentScannerProps) {
  const t = useTranslations("documents.scan");
  const te = useTranslations("documents.errors");

  const [status, setStatus] = React.useState<Status>("idle");
  const [errorCode, setErrorCode] = React.useState<ScanErrorCode | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Object URLs leak until revoked; the ref survives re-renders so the
  // previous preview is released when a new capture replaces it.
  const previewUrlRef = React.useRef<string | null>(null);
  const setPreview = React.useCallback((url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);
  React.useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  async function handleFile(file: File) {
    setErrorCode(null);
    setStatus("preparing");
    setPreview(URL.createObjectURL(file));

    const { blob, type } = await prepareImage(file);

    if (!SUPPORTED.includes(type)) {
      setStatus("idle");
      setErrorCode("unsupported_type");
      return;
    }
    if (blob.size > MAX_BYTES) {
      setStatus("idle");
      setErrorCode("file_too_large");
      return;
    }

    const body = new FormData();
    body.append("file", new File([blob], "capture.jpg", { type }));
    body.append("documentType", documentType);

    setStatus("uploading");
    try {
      const response = await fetch("/api/documents/extract", { method: "POST", body });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setErrorCode(toScanErrorCode(payload?.error));
        return;
      }
      onExtracted((await response.json()) as DocumentExtractionResult);
    } catch {
      // Network failure, not a provider failure — distinct message.
      setErrorCode("network");
    } finally {
      setStatus("idle");
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so re-picking the same file fires change again.
    event.target.value = "";
    if (file) void handleFile(file);
  }

  const busy = status !== "idle" || disabled;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        {previewUrl && (
          // A blob: URL for an in-memory capture that is never uploaded as a
          // static asset — next/image cannot optimize it and would only add
          // a proxy hop, so a plain img is correct here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={t("previewAlt")}
            className="h-16 w-16 shrink-0 rounded border border-border object-cover"
          />
        )}
      </div>

      {/* Both share the row evenly rather than sizing to their text, so
          neither becomes a small target on a phone at a petrol pump. */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={busy}
          className="flex-1 basis-32"
        >
          {status === "uploading" ? t("reading") : status === "preparing" ? t("preparing") : t("takePhoto")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex-1 basis-32"
        >
          {t("chooseFile")}
        </Button>
      </div>

      {/* Two inputs rather than one: `capture` opens the camera directly on
          mobile, which is the common case, but leaves no way to pick an
          existing photo of a bill that arrived by post. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED.join(",")}
        className="hidden"
        onChange={onInputChange}
      />

      {errorCode && (
        <p role="alert" className="text-sm text-destructive">
          {te(errorCode)}
        </p>
      )}
    </div>
  );
}
