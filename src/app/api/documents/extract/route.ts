import { NextResponse } from "next/server";
import { requireCurrentUser, UnauthenticatedError } from "@/shared/lib/session";
import {
  extractDocument,
  isSupportedImageType,
  MAX_IMAGE_BYTES,
  DocumentExtractionError,
} from "@/modules/documents/server/extract";
import type { ApiErrorCode, DocumentType } from "@/modules/documents/schemas/extraction";

/**
 * POST /api/documents/extract  (SRS-scan §22)
 *
 * multipart/form-data: `file` (required), `documentType` (optional hint).
 *
 * A Route Handler rather than a Server Action because this receives a
 * binary upload and streams no state back — and because §19 wants file
 * validation to happen before anything touches a provider.
 *
 * Nothing here logs the image or the extracted values (§19); errors carry
 * a stable code the client maps to a localized message.
 */

/** Codes the client has a specific message for — defined alongside the
 * contract so the route and the UI can't drift apart. Anything unexpected
 * collapses to `provider_failed` rather than leaking internals. */
function errorResponse(code: ApiErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return errorResponse("unauthenticated", 401);
    }
    throw error;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("no_file", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("no_file", 400);
  }

  // Validate before reading the body into memory.
  if (!isSupportedImageType(file.type)) {
    return errorResponse("unsupported_type", 415);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return errorResponse("file_too_large", 413);
  }

  const rawType = formData.get("documentType");
  const expectedType =
    rawType === "FUEL_RECEIPT" || rawType === "ELECTRICITY_BILL"
      ? (rawType as Exclude<DocumentType, "UNKNOWN">)
      : undefined;

  const data = Buffer.from(await file.arrayBuffer());
  // Re-check post-read: `file.size` is client-declared metadata, the byte
  // length is the real thing.
  if (data.byteLength > MAX_IMAGE_BYTES) {
    return errorResponse("file_too_large", 413);
  }

  try {
    const result = await extractDocument({ data, mimeType: file.type }, expectedType);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentExtractionError) {
      // Logged before returning: the client only ever sees a stable code,
      // so without this the actual cause is lost at the one moment it is
      // needed. The message is already redacted by the provider.
      if (error.code !== "provider_not_configured") {
        console.error("Document extraction failed", {
          code: error.code,
          message: error.message,
        });
      }
      const status = error.code === "provider_not_configured" ? 503 : 502;
      return errorResponse(error.code, status);
    }
    console.error("Document extraction failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("provider_failed", 502);
  }
}
