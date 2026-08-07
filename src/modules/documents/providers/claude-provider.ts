import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  documentExtractionSchema,
  type DocumentExtraction,
  type DocumentType,
} from "../schemas/extraction";
import {
  DocumentExtractionError,
  type DocumentExtractionProvider,
  type ImageInput,
} from "./types";
import { parseDecimal, normalizeCurrency, normalizeConfidence, normalizeDate } from "../domain/normalize";

/**
 * Claude vision extraction provider.
 *
 * Chosen over classical OCR because receipts and utility bills vary wildly
 * in layout: a vision model reading the document semantically handles that
 * far better than text extraction plus per-issuer regex, which is where
 * this kind of feature usually rots. Kept strictly behind the provider
 * interface so that judgement is reversible.
 *
 * `server-only` is load-bearing: importing this into a client component is
 * a build error, which is what keeps the API key off the browser (§19).
 */

const MODEL = "claude-opus-5";

/** Fields that are inherently fractional — see parseDecimal's `fractional`
 * option. A fuel price misread by 1000x would corrupt the consumption
 * engine, so these are named explicitly rather than guessed by magnitude. */
const FRACTIONAL_FIELDS = new Set([
  "fuelPrice",
  "liters",
  "previousReadingHigh",
  "currentReadingHigh",
  "previousReadingLow",
  "currentReadingLow",
]);

const SYSTEM_PROMPT = `You extract structured data from photographed receipts and utility bills.

Rules:
- Report only what is legibly present in the image. Never infer, estimate, or invent a value that is not printed on the document.
- Omit any field you cannot read rather than guessing. A missing field is expected and fine; a fabricated one is not.
- confidence is your genuine certainty for that specific field, 0 to 1. Use a low value when the text is blurry, cropped, or ambiguous.
- Dates use the YYYY-MM-DD format. Documents in this region are day-first (07.08.2026 is 7 August 2026).
- Numbers use a decimal point. These documents commonly use a decimal comma and dotted thousands (1.234,56 means 1234.56).
- Fuel receipts: a per-litre price typically has 3 decimals (1.729) and is a small number; do not confuse it with a total.
- Electricity bills: report high (VT/дневна) and low (NT/ноќна) tariff meter readings separately when both are present.
- If the document is not a fuel receipt or an electricity bill, or you cannot tell, return documentType UNKNOWN.`;

/** Anthropic's documented image ceiling is 2576px on the long edge; larger
 * images are downscaled server-side, so there's no benefit to sending more
 * and a real token cost to trying. Enforced upstream at the route. */
export const PROVIDER_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function buildExtractionTool(): Anthropic.Tool {
  const field = (description: string, valueType: "string" | "number") => ({
    type: "object" as const,
    properties: {
      value: { type: valueType, description },
      confidence: { type: "number" as const, description: "Certainty, 0 to 1" },
    },
    required: ["value", "confidence"],
    additionalProperties: false,
  });

  return {
    name: "record_document",
    description: "Record the structured data extracted from the document.",
    input_schema: {
      type: "object",
      properties: {
        documentType: {
          type: "string",
          enum: ["FUEL_RECEIPT", "ELECTRICITY_BILL", "UNKNOWN"],
        },
        date: field("Transaction date, YYYY-MM-DD", "string"),
        time: field("Time of day if printed", "string"),
        stationName: field("Fuel station name", "string"),
        fuelType: field("Fuel grade as printed", "string"),
        fuelPrice: field("Price per litre (small, often 3 decimals)", "number"),
        liters: field("Litres dispensed", "number"),
        totalAmount: field("Total amount paid or billed", "number"),
        currency: field("Currency: EUR or MKD", "string"),
        receiptNumber: field("Receipt number", "string"),
        supplierName: field("Electricity supplier name", "string"),
        invoiceNumber: field("Invoice number", "string"),
        issueDate: field("Issue date, YYYY-MM-DD", "string"),
        periodFrom: field("Billing period start, YYYY-MM-DD", "string"),
        periodTo: field("Billing period end, YYYY-MM-DD", "string"),
        dueDate: field("Payment due date, YYYY-MM-DD", "string"),
        paymentReference: field("Payment reference number", "string"),
        customerNumber: field("Customer or account number", "string"),
        previousReadingHigh: field("Previous high-tariff meter reading", "number"),
        currentReadingHigh: field("Current high-tariff meter reading", "number"),
        previousReadingLow: field("Previous low-tariff meter reading", "number"),
        currentReadingLow: field("Current low-tariff meter reading", "number"),
      },
      required: ["documentType"],
      additionalProperties: false,
    },
  };
}

/** Raw tool input -> the app's contract. Repairs formatting the model may
 * have echoed from the document (decimal commas, dd.mm.yyyy) before Zod
 * validation, so a well-formed value in an unexpected shape is fixed rather
 * than discarded. */
function toDocumentExtraction(raw: Record<string, unknown>): unknown {
  const documentType = raw.documentType;
  if (documentType !== "FUEL_RECEIPT" && documentType !== "ELECTRICITY_BILL") {
    return { documentType: "UNKNOWN" };
  }

  const result: Record<string, unknown> = { documentType };
  const DATE_FIELDS = new Set(["date", "issueDate", "periodFrom", "periodTo", "dueDate"]);

  for (const [key, entry] of Object.entries(raw)) {
    if (key === "documentType" || entry == null || typeof entry !== "object") continue;
    const { value, confidence } = entry as { value?: unknown; confidence?: unknown };
    if (value === undefined || value === null || value === "") continue;

    let normalized: unknown;
    if (DATE_FIELDS.has(key)) {
      normalized = normalizeDate(String(value));
    } else if (key === "currency") {
      normalized = normalizeCurrency(String(value));
    } else if (typeof value === "number" || FRACTIONAL_FIELDS.has(key) || key === "totalAmount") {
      normalized = parseDecimal(value as string | number, {
        fractional: FRACTIONAL_FIELDS.has(key),
      });
    } else {
      normalized = String(value);
    }

    // A value we couldn't normalize is dropped, not passed through broken —
    // the field then reads as "not extracted" in the review screen.
    if (normalized === null || normalized === undefined) continue;

    result[key] = {
      value: normalized,
      confidence: normalizeConfidence(confidence),
      source: "ai",
    };
  }

  return result;
}

export class ClaudeDocumentExtractionProvider implements DocumentExtractionProvider {
  readonly name = "claude";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
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

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [buildExtractionTool()],
        tool_choice: { type: "tool", name: "record_document" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  // Narrowed at the route against SUPPORTED_IMAGE_TYPES.
                  media_type: image.mimeType as "image/jpeg" | "image/png" | "image/webp",
                  data: image.data.toString("base64"),
                },
              },
              { type: "text", text: `${hint}\n\nExtract the document's data.` },
            ],
          },
        ],
      });
    } catch (cause) {
      // Deliberately does not include the request or image in the error (§19).
      throw new DocumentExtractionError(
        "provider_failed",
        "Document extraction provider request failed",
        cause
      );
    }

    // Safety classifiers can decline with a 200 + stop_reason "refusal";
    // reading content[0] unconditionally would throw here.
    if (response.stop_reason === "refusal") {
      throw new DocumentExtractionError(
        "unreadable_document",
        "Provider declined to process this document"
      );
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) {
      throw new DocumentExtractionError(
        "unreadable_document",
        "Provider returned no structured extraction"
      );
    }

    // Never trust provider output — validate before it reaches the UI (§22).
    const parsed = documentExtractionSchema.safeParse(
      toDocumentExtraction(toolUse.input as Record<string, unknown>)
    );
    if (!parsed.success) {
      throw new DocumentExtractionError(
        "unreadable_document",
        "Provider output failed validation"
      );
    }

    return parsed.data;
  }
}
