/**
 * Extraction -> form values. Pure, no React, no I/O.
 *
 * The review screen is the ordinary entry form pre-filled, not a parallel
 * one: reusing it means scanned entries go through exactly the same
 * validation, currency handling and save path as typed ones, and there is no
 * second form to keep in sync. That makes this mapping the only genuinely
 * new logic in the scan flow — so it lives here, where it can be tested.
 */

import type {
  DocumentExtraction,
  ElectricityBillExtraction,
  FuelReceiptExtraction,
} from "../schemas/extraction";
import { isLowConfidence } from "./normalize";
import { deriveFuelValue, type DerivedField } from "@/modules/fuel/domain/derivation";

type Currency = "MKD" | "EUR";

/**
 * Every form field a scan can fill. Closed rather than `string` so that a
 * field added here without a matching `documents.fields` label is a compile
 * error — the low-confidence notice names fields to the user, and a raw
 * camelCase key leaking into that sentence is the failure mode.
 */
export const SCAN_FIELD_KEYS = [
  "date",
  "fuelPrice",
  "liters",
  "totalPaid",
  "station",
  "periodFrom",
  "periodTo",
  "issueDate",
  "dueDate",
  "amount",
  "invoiceNumber",
  "previousReadingHigh",
  "currentReadingHigh",
  "previousReadingLow",
  "currentReadingLow",
] as const;
export type ScanField = (typeof SCAN_FIELD_KEYS)[number];

/** Per-field confidence. Absent = not extracted; the UI shows those as
 * "you need to fill this in". */
export type ConfidenceMap = Partial<Record<ScanField, number>>;

export interface ScanApplication<TValues> {
  values: TValues;
  confidence: ConfidenceMap;
  /** Fields the provider returned but flagged as shaky (§10). */
  lowConfidenceFields: ScanField[];
  /** Currency read off the document, if any. */
  currency: Currency | null;
  /**
   * Set when the document's currency isn't the household's. Blocking, not a
   * warning: every aggregate in this app sums a bare Decimal and assumes one
   * household currency (SRS §8), so a single foreign-currency row silently
   * corrupts totals rather than showing up as an obvious error.
   */
  currencyMismatch: boolean;
}

/** Numbers reach the form as strings because that's what an <input> holds;
 * converting here keeps the components free of parsing. */
function numText(value: number | undefined, decimals: number): string | undefined {
  if (value === undefined) return undefined;
  // Trailing zeros look like false precision on a scanned value.
  return String(Number(value.toFixed(decimals)));
}

function record(
  confidence: ConfidenceMap,
  low: ScanField[],
  field: ScanField,
  entry: { value?: unknown; confidence: number } | undefined
): void {
  if (!entry || entry.value === undefined) return;
  confidence[field] = entry.confidence;
  if (isLowConfidence(entry.confidence)) low.push(field);
}

// ---------------------------------------------------------------------------
// Fuel
// ---------------------------------------------------------------------------

export interface FuelScanValues {
  date?: string;
  fuelPrice?: string;
  liters?: string;
  totalPaid?: string;
  station?: string;
  notes?: string;
}

export interface FuelScanApplication extends ScanApplication<FuelScanValues> {
  /**
   * Which of the three money fields the form should keep computing.
   *
   * If the receipt printed all three we leave it at NONE so the existing
   * discrepancy check actually compares them — that check is a useful signal
   * that the scan misread a digit. Deriving one would make the three agree by
   * construction and throw that signal away.
   */
  derivedField: DerivedField;
  /**
   * Odometer is never printed on a fuel receipt, so a scan can never supply
   * it. Always true — stated explicitly so the UI has something to point at
   * rather than the user submitting a form with a silently empty required
   * field.
   */
  requiresOdometer: true;
}

/** Free-text worth keeping but with no column of its own. The receipt number
 * is the only link back to the paper document — we don't store the image
 * (§19), so without this a scanned entry is unauditable. */
function composeFuelNotes(extraction: FuelReceiptExtraction): string | undefined {
  const parts = [
    extraction.fuelType?.value,
    extraction.receiptNumber?.value ? `#${extraction.receiptNumber.value}` : undefined,
    extraction.time?.value,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function applyFuelExtraction(
  extraction: FuelReceiptExtraction,
  householdCurrency: Currency
): FuelScanApplication {
  const confidence: ConfidenceMap = {};
  const lowConfidenceFields: ScanField[] = [];

  record(confidence, lowConfidenceFields, "date", extraction.date);
  record(confidence, lowConfidenceFields, "fuelPrice", extraction.fuelPrice);
  record(confidence, lowConfidenceFields, "liters", extraction.liters);
  record(confidence, lowConfidenceFields, "totalPaid", extraction.totalAmount);
  record(confidence, lowConfidenceFields, "station", extraction.stationName);

  const fuelPrice = extraction.fuelPrice?.value;
  const liters = extraction.liters?.value;
  const totalPaid = extraction.totalAmount?.value;

  // Derive only the one field that's missing, and only when the other two
  // are present and usable — dividing by a zero the provider read off a
  // smudge would write a nonsense value into the form.
  let derivedField: DerivedField = "NONE";
  let derived: { field: "fuelPrice" | "liters" | "totalPaid"; value: number } | null = null;
  const present = [fuelPrice, liters, totalPaid].filter((v) => v !== undefined).length;

  if (present === 2) {
    if (fuelPrice === undefined && liters! > 0) {
      derivedField = "FUEL_PRICE";
      derived = { field: "fuelPrice", value: deriveFuelValue({ fuelPrice: 0, liters: liters!, totalPaid: totalPaid! }, "FUEL_PRICE") };
    } else if (liters === undefined && fuelPrice! > 0) {
      derivedField = "LITERS";
      derived = { field: "liters", value: deriveFuelValue({ fuelPrice: fuelPrice!, liters: 0, totalPaid: totalPaid! }, "LITERS") };
    } else if (totalPaid === undefined) {
      derivedField = "TOTAL_PAID";
      derived = { field: "totalPaid", value: deriveFuelValue({ fuelPrice: fuelPrice!, liters: liters!, totalPaid: 0 }, "TOTAL_PAID") };
    }
  }

  const values: FuelScanValues = {
    date: extraction.date?.value,
    fuelPrice: numText(fuelPrice, 3),
    liters: numText(liters, 3),
    totalPaid: numText(totalPaid, 2),
    station: extraction.stationName?.value,
    notes: composeFuelNotes(extraction),
  };

  if (derived) {
    const decimals = derived.field === "totalPaid" ? 2 : 3;
    values[derived.field] = numText(derived.value, decimals);
    // Marked calculated, not scanned: it wasn't read off the document, and
    // the UI shouldn't imply the paper agrees with it.
    confidence[derived.field] = 1;
  }

  const currency = extraction.currency?.value ?? null;

  return {
    values,
    confidence,
    lowConfidenceFields,
    currency,
    currencyMismatch: currency !== null && currency !== householdCurrency,
    derivedField,
    requiresOdometer: true,
  };
}

// ---------------------------------------------------------------------------
// Electricity
// ---------------------------------------------------------------------------

export interface BillScanValues {
  periodFrom?: string;
  periodTo?: string;
  issueDate?: string;
  dueDate?: string;
  amount?: string;
  invoiceNumber?: string;
  previousReadingHigh?: string;
  currentReadingHigh?: string;
  previousReadingLow?: string;
  currentReadingLow?: string;
}

export interface BillScanApplication extends ScanApplication<BillScanValues> {
  /**
   * The account tracks meter readings but the scan didn't produce all four.
   * Worth surfacing up-front: the save would otherwise fail on four separate
   * field errors after the user has already reviewed everything else.
   */
  missingReadings: boolean;
}

const READING_FIELDS = [
  "previousReadingHigh",
  "currentReadingHigh",
  "previousReadingLow",
  "currentReadingLow",
] as const;

export function applyBillExtraction(
  extraction: ElectricityBillExtraction,
  householdCurrency: Currency,
  tracksReadings: boolean
): BillScanApplication {
  const confidence: ConfidenceMap = {};
  const lowConfidenceFields: ScanField[] = [];

  record(confidence, lowConfidenceFields, "periodFrom", extraction.periodFrom);
  record(confidence, lowConfidenceFields, "periodTo", extraction.periodTo);
  record(confidence, lowConfidenceFields, "issueDate", extraction.issueDate);
  record(confidence, lowConfidenceFields, "dueDate", extraction.dueDate);
  record(confidence, lowConfidenceFields, "amount", extraction.totalAmount);
  record(confidence, lowConfidenceFields, "invoiceNumber", extraction.invoiceNumber);
  for (const field of READING_FIELDS) {
    record(confidence, lowConfidenceFields, field, extraction[field]);
  }

  const values: BillScanValues = {
    periodFrom: extraction.periodFrom?.value,
    periodTo: extraction.periodTo?.value,
    issueDate: extraction.issueDate?.value,
    dueDate: extraction.dueDate?.value,
    amount: numText(extraction.totalAmount?.value, 2),
    invoiceNumber: extraction.invoiceNumber?.value,
    previousReadingHigh: numText(extraction.previousReadingHigh?.value, 3),
    currentReadingHigh: numText(extraction.currentReadingHigh?.value, 3),
    previousReadingLow: numText(extraction.previousReadingLow?.value, 3),
    currentReadingLow: numText(extraction.currentReadingLow?.value, 3),
  };

  const currency = extraction.currency?.value ?? null;
  const readingsFound = READING_FIELDS.filter((f) => values[f] !== undefined).length;

  return {
    values,
    confidence,
    lowConfidenceFields,
    currency,
    currencyMismatch: currency !== null && currency !== householdCurrency,
    missingReadings: tracksReadings && readingsFound < READING_FIELDS.length,
  };
}

/** Narrowing helpers so components don't repeat the discriminant check. */
export function isFuelExtraction(e: DocumentExtraction): e is FuelReceiptExtraction {
  return e.documentType === "FUEL_RECEIPT";
}
export function isBillExtraction(e: DocumentExtraction): e is ElectricityBillExtraction {
  return e.documentType === "ELECTRICITY_BILL";
}
