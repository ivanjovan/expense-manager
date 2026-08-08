import "server-only";
import type { DocumentExtractionResult, DocumentType } from "../schemas/extraction";
import {
  getDocumentExtractionProvider,
  isDocumentExtractionConfigured,
} from "../providers/registry";
import { DocumentExtractionError, type ImageInput } from "../providers/types";

/** Only formats every provider and browser handles. HEIC is deliberately
 * excluded: iOS converts to JPEG on upload via a file input, and accepting
 * it would mean a server-side transcode dependency for no real gain. */
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** §19 — reject oversized uploads before any provider call. Per page. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** An electricity bill needs two pages: readings on one, charges on the
 * other. A small ceiling above that leaves room for a stapled extra sheet
 * without letting a mis-click upload an album. */
export const MAX_PAGES = 4;

/** Applies across all pages combined, so four large photos can't sidestep
 * the per-page limit. */
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export function isSupportedImageType(mimeType: string): boolean {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Runs extraction and computes the type-mismatch flag (§5).
 *
 * The mismatch is reported, never acted on: an electricity bill scanned
 * from the fuel module still comes back as an electricity extraction, and
 * the UI asks the user what to do. Silently reinterpreting it is the one
 * behaviour the spec explicitly forbids.
 */
export async function extractDocument(
  pages: ImageInput[],
  expectedType?: Exclude<DocumentType, "UNKNOWN">
): Promise<DocumentExtractionResult> {
  const provider = getDocumentExtractionProvider();
  const extraction = await provider.extract(pages, expectedType);

  const mismatch =
    expectedType !== undefined &&
    extraction.documentType !== "UNKNOWN" &&
    extraction.documentType !== expectedType;

  return { extraction, expectedType, mismatch, provider: provider.name, pageCount: pages.length };
}

export { DocumentExtractionError, isDocumentExtractionConfigured };
