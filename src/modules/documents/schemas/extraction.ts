import { z } from "zod";

/**
 * The application-facing extraction contract — SRS-scan §9/§10/§22.
 *
 * Nothing provider-specific appears here or anywhere downstream: a provider
 * translates its own response into these shapes, and the rest of the app
 * only ever sees this. Swapping providers is then a file, not a refactor.
 *
 * Everything except `documentType` and `confidence` is optional by design:
 * a missing field must never fail the extraction (§18).
 */

export const DOCUMENT_TYPES = ["FUEL_RECEIPT", "ELECTRICITY_BILL", "UNKNOWN"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const SUPPORTED_CURRENCIES = ["EUR", "MKD"] as const;

/** Where a value came from. `user` never appears in provider output — it's
 * set client-side once the user edits a field, so the review UI can stop
 * flagging a value the user has already taken ownership of. */
export const FIELD_SOURCES = ["ocr", "ai", "calculated", "user"] as const;
export type FieldSource = (typeof FIELD_SOURCES)[number];

/** A single extracted value plus how much the provider trusts it (§10). */
export function extractedField<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema.optional(),
    confidence: z.number().min(0).max(1),
    source: z.enum(FIELD_SOURCES).default("ai"),
  });
}

const extractedString = extractedField(z.string());
const extractedNumber = extractedField(z.number());
/** ISO `YYYY-MM-DD`. Providers are asked for this shape directly; anything
 * else is repaired by the normalizer before validation (see domain/normalize). */
const extractedDate = extractedField(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const extractedCurrency = extractedField(z.enum(SUPPORTED_CURRENCIES));

export const fuelReceiptExtractionSchema = z.object({
  documentType: z.literal("FUEL_RECEIPT"),
  date: extractedDate.optional(),
  time: extractedString.optional(),
  stationName: extractedString.optional(),
  fuelType: extractedString.optional(),
  fuelPrice: extractedNumber.optional(),
  liters: extractedNumber.optional(),
  totalAmount: extractedNumber.optional(),
  currency: extractedCurrency.optional(),
  receiptNumber: extractedString.optional(),
});
export type FuelReceiptExtraction = z.infer<typeof fuelReceiptExtractionSchema>;

/**
 * Electricity adds the four meter-reading fields the original plan omitted.
 * Our dual-tariff accounts reject a bill missing either band
 * (utilities/server/bill-actions.ts), so without these an extracted bill
 * could be reviewed but never saved.
 */
export const electricityBillExtractionSchema = z.object({
  documentType: z.literal("ELECTRICITY_BILL"),
  supplierName: extractedString.optional(),
  invoiceNumber: extractedString.optional(),
  issueDate: extractedDate.optional(),
  periodFrom: extractedDate.optional(),
  periodTo: extractedDate.optional(),
  dueDate: extractedDate.optional(),
  totalAmount: extractedNumber.optional(),
  currency: extractedCurrency.optional(),
  paymentReference: extractedString.optional(),
  customerNumber: extractedString.optional(),
  previousReadingHigh: extractedNumber.optional(),
  currentReadingHigh: extractedNumber.optional(),
  previousReadingLow: extractedNumber.optional(),
  currentReadingLow: extractedNumber.optional(),
});
export type ElectricityBillExtraction = z.infer<typeof electricityBillExtractionSchema>;

/** Returned when the provider can't tell what the document is (§18). The UI
 * offers the user the choice rather than guessing. */
export const unknownExtractionSchema = z.object({
  documentType: z.literal("UNKNOWN"),
});

export const documentExtractionSchema = z.discriminatedUnion("documentType", [
  fuelReceiptExtractionSchema,
  electricityBillExtractionSchema,
  unknownExtractionSchema,
]);
export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;

/** What the API route returns and the review screen consumes. `mismatch` is
 * set when the caller expected one type and the document looks like another
 * — surfaced as a warning, never silently reinterpreted (§5). */
export interface DocumentExtractionResult {
  extraction: DocumentExtraction;
  expectedType?: Exclude<DocumentType, "UNKNOWN">;
  mismatch: boolean;
}
