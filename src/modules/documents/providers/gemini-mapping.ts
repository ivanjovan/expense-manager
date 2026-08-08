import { Type, type Schema } from "@google/genai";
import {
  documentExtractionSchema,
  type DocumentExtraction,
} from "../schemas/extraction";
import { parseDecimal, normalizeCurrency, normalizeConfidence, normalizeDate } from "../domain/normalize";

/**
 * The pure half of the Gemini provider: prompt, response schema, and the
 * mapping from raw model output to the app's contract.
 *
 * Deliberately not `server-only`. It holds no credentials and makes no
 * network call, and keeping it importable means the part that can silently
 * misread a number — the one that turns "1.729" into a price or a total —
 * is unit-tested rather than only exercised against a live API key.
 */

/**
 * Overridable because model IDs are retired on a schedule this repo can't
 * track. If Google renames or sunsets the default, that becomes an env var
 * change rather than a deploy.
 */
export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Fields where a lone separator with three trailing digits means decimals,
 * not thousands — see parseDecimal's `fractional` option. Mirrors the
 * Claude provider deliberately: this list is a property of the documents,
 * not of the model reading them. */
const FRACTIONAL_FIELDS = new Set([
  "fuelPrice",
  "liters",
  "previousReadingHigh",
  "currentReadingHigh",
  "previousReadingLow",
  "currentReadingLow",
]);

const DATE_FIELDS = new Set(["date", "issueDate", "periodFrom", "periodTo", "dueDate"]);

export const SYSTEM_INSTRUCTION = `You extract structured data from photographed receipts and utility bills.

Rules:
- Report only what is legibly present in the image. Never infer, estimate, or invent a value that is not printed on the document.
- Omit any field you cannot read rather than guessing. A missing field is expected and fine; a fabricated one is not.
- confidence is your genuine certainty for that specific field, 0 to 1. Use a low value when the text is blurry, cropped, or ambiguous.
- Dates use the YYYY-MM-DD format. Documents in this region are day-first (07.08.2026 is 7 August 2026).
- Numbers use a decimal point. These documents commonly use a decimal comma and dotted thousands (1.234,56 means 1234.56).
- Documents may be in Macedonian or Serbian, in Cyrillic or Latin script.
- Fuel receipts: a per-litre price typically has 3 decimals and is a small number; do not confuse it with a total.
- Electricity bills: report high (VT / дневна / висока) and low (NT / ноќна / ниска) tariff meter readings separately when both are present.
- If the document is not a fuel receipt or an electricity bill, or you cannot tell, return documentType UNKNOWN.`;

/** Value + confidence, matching the app's extraction contract. Values are
 * requested as strings throughout: the model echoes what is printed, and
 * the normalizers repair "1.234,56" far more reliably than a JSON number
 * parser that has already guessed. */
function field(description: string): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      value: { type: Type.STRING, description },
      confidence: { type: Type.NUMBER, description: "Certainty, 0 to 1" },
    },
    required: ["value", "confidence"],
  };
}

export function buildResponseSchema(): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      documentType: {
        type: Type.STRING,
        enum: ["FUEL_RECEIPT", "ELECTRICITY_BILL", "UNKNOWN"],
      },
      date: field("Transaction date, YYYY-MM-DD"),
      time: field("Time of day if printed"),
      stationName: field("Fuel station name"),
      fuelType: field("Fuel grade as printed"),
      fuelPrice: field("Price per litre (small, often 3 decimals)"),
      liters: field("Litres dispensed"),
      totalAmount: field("Total amount paid or billed"),
      currency: field("Currency: EUR or MKD"),
      receiptNumber: field("Receipt number"),
      supplierName: field("Electricity supplier name"),
      invoiceNumber: field("Invoice number"),
      issueDate: field("Issue date, YYYY-MM-DD"),
      periodFrom: field("Billing period start, YYYY-MM-DD"),
      periodTo: field("Billing period end, YYYY-MM-DD"),
      dueDate: field("Payment due date, YYYY-MM-DD"),
      paymentReference: field("Payment reference number"),
      customerNumber: field("Customer or account number"),
      previousReadingHigh: field("Previous high-tariff meter reading"),
      currentReadingHigh: field("Current high-tariff meter reading"),
      previousReadingLow: field("Previous low-tariff meter reading"),
      currentReadingLow: field("Current low-tariff meter reading"),
    },
    required: ["documentType"],
  };
}

/**
 * Raw model output -> the app's contract, repairing regional number and
 * date formats before Zod validation so a well-formed value in an
 * unexpected shape is fixed rather than discarded.
 *
 * Identical in behaviour to the Claude provider's mapper. Kept as separate
 * copies rather than shared: they translate two different vendors' output
 * shapes, and merging them would couple the two providers so that a change
 * for one risks the other.
 */
function toDocumentExtraction(raw: Record<string, unknown>): unknown {
  const documentType = raw.documentType;
  if (documentType !== "FUEL_RECEIPT" && documentType !== "ELECTRICITY_BILL") {
    return { documentType: "UNKNOWN" };
  }

  const result: Record<string, unknown> = { documentType };

  for (const [key, entry] of Object.entries(raw)) {
    if (key === "documentType" || entry == null || typeof entry !== "object") continue;
    const { value, confidence } = entry as { value?: unknown; confidence?: unknown };
    if (value === undefined || value === null || value === "") continue;

    let normalized: unknown;
    if (DATE_FIELDS.has(key)) {
      normalized = normalizeDate(String(value));
    } else if (key === "currency") {
      normalized = normalizeCurrency(String(value));
    } else if (FRACTIONAL_FIELDS.has(key) || key === "totalAmount") {
      normalized = parseDecimal(value as string | number, {
        fractional: FRACTIONAL_FIELDS.has(key),
      });
    } else {
      normalized = String(value);
    }

    if (normalized === null || normalized === undefined) continue;

    result[key] = {
      value: normalized,
      confidence: normalizeConfidence(confidence),
      source: "ai",
    };
  }

  return result;
}


/** Parses and validates raw model output. Returns null when the payload is
 * unusable, so the caller decides which error code that becomes. */
export function parseGeminiExtraction(raw: unknown): DocumentExtraction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const parsed = documentExtractionSchema.safeParse(
    toDocumentExtraction(raw as Record<string, unknown>)
  );
  return parsed.success ? parsed.data : null;
}

export { toDocumentExtraction };
