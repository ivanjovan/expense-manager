"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { X } from "lucide-react";
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
 * Handles multi-page documents because an electricity bill is one: the
 * meter readings sit on one sheet and the charges — tax, and any debt
 * carried over from an unpaid bill — on another. Pages are collected first
 * and sent together in a single request, so the model reconciles them
 * itself rather than us inventing merge rules.
 *
 * Owns capture, downscaling and the API call. It deliberately does *not*
 * know what a fuel receipt is — it hands the result to whichever form
 * embedded it, which is what lets one component serve both modules.
 */

/** Anthropic and Gemini both downscale above roughly this on the long edge,
 * so sending more costs upload time on a phone connection and buys nothing. */
const MAX_EDGE_PX = 1568;
const JPEG_QUALITY = 0.85;
const SUPPORTED = ["image/jpeg", "image/png", "image/webp"];
/** Mirrors MAX_IMAGE_BYTES on the server — checked here too so a 12MP photo
 * fails instantly instead of after a long upload. */
const MAX_BYTES = 10 * 1024 * 1024;

type Status = "idle" | "preparing" | "uploading";

interface CapturedPage {
  blob: Blob;
  type: string;
  url: string;
}

interface DocumentScannerProps {
  documentType: Exclude<DocumentType, "UNKNOWN">;
  onExtracted: (result: DocumentExtractionResult) => void;
  disabled?: boolean;
  /**
   * How many pages this kind of document normally has. Only drives the
   * guidance text and the ceiling — a user with a one-page bill can still
   * read it with one, and nothing blocks on reaching this number.
   */
  expectedPages?: number;
}

/**
 * Re-encodes a capture down to something worth uploading.
 *
 * `imageOrientation: "from-image"` is load-bearing: without it a photo taken
 * in portrait arrives rotated, because the EXIF orientation flag is dropped
 * when the bitmap is drawn to a canvas. A sideways bill extracts badly.
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

export function DocumentScanner({
  documentType,
  onExtracted,
  disabled,
  expectedPages = 1,
}: DocumentScannerProps) {
  const t = useTranslations("documents.scan");
  const te = useTranslations("documents.errors");

  const [status, setStatus] = React.useState<Status>("idle");
  const [errorCode, setErrorCode] = React.useState<ScanErrorCode | null>(null);
  const [pages, setPages] = React.useState<CapturedPage[]>([]);

  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Object URLs leak until revoked. The ref mirrors state so the unmount
  // cleanup sees the current list without re-running on every capture —
  // written in an effect, never during render.
  const pagesRef = React.useRef<CapturedPage[]>([]);
  React.useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  React.useEffect(() => {
    return () => {
      for (const page of pagesRef.current) URL.revokeObjectURL(page.url);
    };
  }, []);

  async function addPages(files: File[]) {
    setErrorCode(null);
    setStatus("preparing");
    try {
      const prepared: CapturedPage[] = [];
      for (const file of files) {
        if (pages.length + prepared.length >= 4) break;
        const { blob, type } = await prepareImage(file);
        if (!SUPPORTED.includes(type)) {
          setErrorCode("unsupported_type");
          continue;
        }
        if (blob.size > MAX_BYTES) {
          setErrorCode("file_too_large");
          continue;
        }
        prepared.push({ blob, type, url: URL.createObjectURL(blob) });
      }
      if (prepared.length > 0) setPages((current) => [...current, ...prepared]);
    } finally {
      setStatus("idle");
    }
  }

  function removePage(index: number) {
    setPages((current) => {
      const page = current[index];
      if (page) URL.revokeObjectURL(page.url);
      return current.filter((_, i) => i !== index);
    });
  }

  async function handleRead() {
    if (pages.length === 0) return;
    setErrorCode(null);
    setStatus("uploading");

    const body = new FormData();
    // Same field name repeated, read with getAll on the server — pages stay
    // in capture order, which is what the page numbering in the prompt means.
    pages.forEach((page, index) => {
      body.append("file", new File([page.blob], `page-${index + 1}.jpg`, { type: page.type }));
    });
    body.append("documentType", documentType);

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
    const files = Array.from(event.target.files ?? []);
    // Reset so re-picking the same file fires change again.
    event.target.value = "";
    if (files.length > 0) void addPages(files);
  }

  const busy = status !== "idle" || disabled;
  const multiPage = expectedPages > 1;
  const canRead = pages.length > 0 && !busy;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 sm:p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-xs text-muted-foreground">
          {multiPage ? t("subtitlePages", { count: expectedPages }) : t("subtitle")}
        </p>
      </div>

      {pages.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {pages.map((page, index) => (
            <li key={page.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob:
                  URL for an in-memory capture; next/image cannot optimize it. */}
              <img
                src={page.url}
                alt={t("pageAlt", { number: index + 1 })}
                className="h-20 w-16 rounded border border-border object-cover"
              />
              <span className="absolute bottom-0 left-0 rounded-br rounded-tl bg-background/80 px-1 text-[10px] font-medium">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removePage(index)}
                aria-label={t("removePage", { number: index + 1 })}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={pages.length > 0 ? "outline" : "default"}
          onClick={() => cameraInputRef.current?.click()}
          disabled={busy}
          className="flex-1 basis-32"
        >
          {status === "preparing"
            ? t("preparing")
            : pages.length === 0
              ? t("takePhoto")
              : t("addPage")}
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

      {pages.length > 0 && (
        <Button type="button" onClick={handleRead} disabled={!canRead} className="w-full">
          {status === "uploading" ? t("reading") : t("readPages", { count: pages.length })}
        </Button>
      )}

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
        multiple={multiPage}
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
