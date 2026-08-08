import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { DocumentExtraction, DocumentType } from "../schemas/extraction";
import {
  DocumentExtractionError,
  type DocumentExtractionProvider,
  type ImageInput,
} from "./types";
import {
  DEFAULT_MODEL,
  SYSTEM_INSTRUCTION,
  buildResponseSchema,
  parseGeminiExtraction,
} from "./gemini-mapping";
import { describeProviderError, providerErrorHint } from "./provider-error";

/**
 * Gemini vision extraction provider.
 *
 * Same contract as the Claude provider — it returns a validated
 * DocumentExtraction and nothing above this file knows which one ran. That
 * was the point of the seam: switching costs one env var.
 *
 * Structured output is enforced with `responseSchema` + a JSON response
 * MIME type, which is Gemini's equivalent of forcing a tool call. Without
 * it the model returns prose around the JSON and parsing becomes guesswork.
 *
 * `server-only` keeps the key out of the browser bundle at build time.
 */

export class GeminiDocumentExtractionProvider implements DocumentExtractionProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async extract(
    image: ImageInput,
    expectedType?: Exclude<DocumentType, "UNKNOWN">
  ): Promise<DocumentExtraction> {
    const hint = expectedType
      ? `The user started from the ${
          expectedType === "FUEL_RECEIPT" ? "fuel" : "electricity"
        } module, so this is most likely a ${
          expectedType === "FUEL_RECEIPT" ? "fuel receipt" : "electricity bill"
        } — but classify what you actually see, not what is expected.`
      : "Classify the document from its content.";

    let text: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.data.toString("base64"),
                },
              },
              { text: `${hint}\n\nExtract the document's data.` },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: buildResponseSchema(),
          // Extraction is a reading task, not a creative one.
          temperature: 0,
        },
      });

      // A safety block returns a response with no candidates rather than
      // throwing, so reading .text unconditionally would silently yield
      // undefined and look like a parse failure.
      if (response.promptFeedback?.blockReason) {
        throw new DocumentExtractionError(
          "unreadable_document",
          "Provider declined to process this document"
        );
      }
      text = response.text;
    } catch (cause) {
      if (cause instanceof DocumentExtractionError) throw cause;
      // Carries a redacted description so the failure is diagnosable from
      // the logs. Excludes the request body and the image (§19), and
      // scrubs the API key the SDK echoes in the request URL.
      const description = describeProviderError(cause);
      const hint = providerErrorHint(description);
      throw new DocumentExtractionError(
        "provider_failed",
        `Gemini request failed (model ${this.model}): ${description}${hint ? ` — ${hint}` : ""}`,
        cause
      );
    }

    if (!text) {
      throw new DocumentExtractionError(
        "unreadable_document",
        "Provider returned no structured extraction"
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new DocumentExtractionError(
        "unreadable_document",
        "Provider output was not valid JSON"
      );
    }
    // Never trust provider output — validate before it reaches the UI (§22).
    const extraction = parseGeminiExtraction(raw);
    if (!extraction) {
      throw new DocumentExtractionError(
        "unreadable_document",
        "Provider output failed validation"
      );
    }

    return extraction;
  }
}
