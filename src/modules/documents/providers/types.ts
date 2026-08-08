import type { DocumentExtraction, DocumentType } from "../schemas/extraction";

/**
 * The provider seam (SRS-scan §8/§23). Everything above this line speaks
 * only `DocumentExtraction`; everything below is free to be provider-shaped.
 * Replacing the provider means writing one new file and changing one env
 * var — no call site moves.
 */

export interface ImageInput {
  /** Raw image bytes. Never logged (§19). */
  data: Buffer;
  /** Validated against SUPPORTED_IMAGE_TYPES before reaching a provider. */
  mimeType: string;
}

export interface DocumentExtractionProvider {
  /** Stable identifier, used in logs and errors — never the API key. */
  readonly name: string;

  /**
   * Extracts one document that may span several pages.
   *
   * Pages arrive together, in order, as a single request rather than one
   * call per page. An electricity bill splits its meter readings across one
   * page and its charges — tax, and any debt carried over from an unpaid
   * bill — across another, and those have to be reconciled against each
   * other. Extracting pages separately would mean inventing merge rules for
   * fields that appear on both, and would lose the cross-page arithmetic
   * that catches a misread digit.
   *
   * `expectedType` is a hint from the module the user started in, not a
   * constraint: a provider must still report what the document actually
   * looks like so a mismatch can be surfaced (§5).
   */
  extract(
    pages: ImageInput[],
    expectedType?: Exclude<DocumentType, "UNKNOWN">
  ): Promise<DocumentExtraction>;
}

/** Thrown for conditions the UI has a specific message for (§18). Anything
 * else propagates as a generic failure. */
export type ExtractionErrorCode =
  | "provider_not_configured"
  | "provider_failed"
  | "unreadable_document";

export class DocumentExtractionError extends Error {
  constructor(
    readonly code: ExtractionErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}
