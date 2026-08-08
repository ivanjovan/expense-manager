import type { DocumentExtraction, DocumentType } from "../schemas/extraction";
import { documentExtractionSchema, MOCK_PROVIDER_NAME } from "../schemas/extraction";
import { DocumentExtractionError, type DocumentExtractionProvider, type ImageInput } from "./types";

/**
 * Fixture provider — lets the whole scan flow be built, demoed and tested
 * without an API key or a paid request.
 *
 * The fixtures are deliberately *imperfect*: each one leaves some fields
 * unextracted and marks one low-confidence. A mock that returns a complete,
 * fully-confident result would let us build a review screen that looks fine
 * and then falls apart on the first real receipt, which is exactly the class
 * of bug the review screen exists to catch.
 *
 * Not `server-only`: it holds no credentials, and keeping it importable from
 * tests is worth more than a guard it doesn't need.
 *
 * The values it returns are invented. `MOCK_PROVIDER_NAME` is surfaced all
 * the way to the review UI so the user is told that, rather than being shown
 * plausible-looking financial data with no indication of where it came from.
 */

/** Simulated round-trip, so loading states are actually visible while
 * developing against the mock. */
const SIMULATED_LATENCY_MS = 600;

const FUEL_FIXTURE = {
  documentType: "FUEL_RECEIPT",
  date: { value: "2026-08-05", confidence: 0.94, source: "ai" },
  time: { value: "17:42", confidence: 0.88, source: "ai" },
  stationName: { value: "Makpetrol Karpoš", confidence: 0.82, source: "ai" },
  fuelType: { value: "Eurodiesel BS", confidence: 0.79, source: "ai" },
  fuelPrice: { value: 85.5, confidence: 0.96, source: "ai" },
  // Deliberately low, and on a field the form actually renders: thermal
  // receipts fade exactly here, and a badge on a field the user can't see
  // would be no test of the review UI at all.
  liters: { value: 41.226, confidence: 0.68, source: "ai" },
  totalAmount: { value: 3524.82, confidence: 0.97, source: "ai" },
  currency: { value: "MKD", confidence: 0.99, source: "ai" },
  receiptNumber: { value: "0042318", confidence: 0.61, source: "ai" },
} satisfies Record<string, unknown>;

const ELECTRICITY_FIXTURE = {
  documentType: "ELECTRICITY_BILL",
  supplierName: { value: "EVN Home", confidence: 0.95, source: "ai" },
  invoiceNumber: { value: "2026-07-8841203", confidence: 0.87, source: "ai" },
  issueDate: { value: "2026-08-03", confidence: 0.92, source: "ai" },
  periodFrom: { value: "2026-07-01", confidence: 0.9, source: "ai" },
  periodTo: { value: "2026-07-31", confidence: 0.9, source: "ai" },
  dueDate: { value: "2026-08-20", confidence: 0.93, source: "ai" },
  totalAmount: { value: 3187.0, confidence: 0.96, source: "ai" },
  taxAmount: { value: 486.15, confidence: 0.91, source: "ai" },
  previousDebt: { value: 1240.0, confidence: 0.87, source: "ai" },
  totalDue: { value: 4427.0, confidence: 0.95, source: "ai" },
  currency: { value: "MKD", confidence: 0.99, source: "ai" },
  customerNumber: { value: "1100294817", confidence: 0.84, source: "ai" },
  previousReadingHigh: { value: 24180, confidence: 0.89, source: "ai" },
  currentReadingHigh: { value: 24476, confidence: 0.86, source: "ai" },
  previousReadingLow: { value: 11902, confidence: 0.88, source: "ai" },
  // Low tariff current reading is the classic blurry-corner field on these
  // bills, so the fixture models it as low-confidence.
  currentReadingLow: { value: 12043, confidence: 0.58, source: "ai" },
} satisfies Record<string, unknown>;

export class MockDocumentExtractionProvider implements DocumentExtractionProvider {
  readonly name = MOCK_PROVIDER_NAME;

  async extract(
    pages: ImageInput[],
    expectedType?: Exclude<DocumentType, "UNKNOWN">
  ): Promise<DocumentExtraction> {
    if (pages.length === 0 || pages.some((page) => page.data.byteLength === 0)) {
      throw new DocumentExtractionError("unreadable_document", "Empty image");
    }

    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));

    // With no hint there is nothing to classify from — a fixture provider
    // that guessed would be modelling a capability it doesn't have.
    const fixture =
      expectedType === "FUEL_RECEIPT"
        ? FUEL_FIXTURE
        : expectedType === "ELECTRICITY_BILL"
          ? ELECTRICITY_FIXTURE
          : { documentType: "UNKNOWN" };

    // Parsed rather than cast, so a fixture that drifts out of contract fails
    // here in development instead of in the review screen.
    return documentExtractionSchema.parse(fixture);
  }
}
