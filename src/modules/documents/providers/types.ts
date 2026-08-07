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
   * `expectedType` is a hint from the module the user started in, not a
   * constraint: a provider must still report what the document actually
   * looks like so a mismatch can be surfaced (§5).
   */
  extract(
    image: ImageInput,
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
