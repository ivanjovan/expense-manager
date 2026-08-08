import { describe, expect, it } from "vitest";
import { toDocumentExtraction } from "./gemini-mapping";
import { documentExtractionSchema } from "../schemas/extraction";

/**
 * The mapper is the part of the provider that can be wrong without an API
 * key, and it is where a misread number would silently corrupt data. The
 * network call itself is thin and can only be exercised against a real key.
 *
 * Gemini's responseSchema asks for every value as a string, so these
 * fixtures are string-shaped on purpose — that is genuinely what arrives.
 */

const f = (value: string, confidence = 0.9) => ({ value, confidence });

function parse(raw: Record<string, unknown>) {
  return documentExtractionSchema.safeParse(toDocumentExtraction(raw));
}

describe("gemini mapper — fuel receipts", () => {
  it("maps a well-formed receipt", () => {
    const result = parse({
      documentType: "FUEL_RECEIPT",
      date: f("2026-08-05"),
      fuelPrice: f("85.5"),
      liters: f("41.226"),
      totalAmount: f("3524.82"),
      currency: f("MKD"),
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.documentType === "FUEL_RECEIPT") {
      expect(result.data.fuelPrice?.value).toBe(85.5);
      expect(result.data.liters?.value).toBe(41.226);
    }
  });

  it("reads a decimal comma correctly", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", totalAmount: f("3.524,82") });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.totalAmount?.value).toBe(3524.82);
  });

  it("reads a three-decimal fuel price as fractional, not thousands", () => {
    // The whole reason parseDecimal takes a `fractional` hint: 1.729 is a
    // plausible EUR/L price and a plausible MKD total, 1000x apart.
    const result = parse({ documentType: "FUEL_RECEIPT", fuelPrice: f("1.729") });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.fuelPrice?.value).toBe(1.729);
  });

  it("still reads a dotted thousands total as thousands", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", totalAmount: f("3.524") });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.totalAmount?.value).toBe(3524);
  });

  it("repairs a day-first date", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", date: f("05.08.2026") });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.date?.value).toBe("2026-08-05");
  });

  it("maps the denar symbol to MKD", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", currency: f("ден") });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.currency?.value).toBe("MKD");
  });

  it("drops a value it cannot normalize rather than passing it through broken", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", date: f("not a date"), liters: f("40") });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.date).toBeUndefined();
    expect(result.data.liters?.value).toBe(40);
  });

  it("converts a percentage confidence into a fraction", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", liters: { value: "40", confidence: 92 } });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.liters?.confidence).toBeCloseTo(0.92, 6);
  });

  it("skips empty-string values", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", stationName: f("") });
    if (!result.success) throw new Error("expected success");
    if (result.data.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    expect(result.data.stationName).toBeUndefined();
  });
});

describe("gemini mapper — electricity bills", () => {
  it("maps all four dual-tariff readings", () => {
    const result = parse({
      documentType: "ELECTRICITY_BILL",
      periodFrom: f("01.07.2026"),
      periodTo: f("31.07.2026"),
      totalAmount: f("3.187,45"),
      currency: f("МКД"),
      previousReadingHigh: f("24180"),
      currentReadingHigh: f("24476"),
      previousReadingLow: f("11902"),
      currentReadingLow: f("12043"),
    });
    expect(result.success).toBe(true);
    if (!result.success || result.data.documentType !== "ELECTRICITY_BILL") return;
    expect(result.data.periodFrom?.value).toBe("2026-07-01");
    expect(result.data.totalAmount?.value).toBe(3187.45);
    expect(result.data.currency?.value).toBe("MKD");
    expect(result.data.previousReadingHigh?.value).toBe(24180);
    expect(result.data.currentReadingLow?.value).toBe(12043);
  });
});

describe("gemini mapper — unknown documents", () => {
  it("collapses an unrecognized type to UNKNOWN", () => {
    const result = parse({ documentType: "WATER_BILL", totalAmount: f("100") });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.documentType).toBe("UNKNOWN");
  });

  it("collapses a missing type to UNKNOWN rather than failing", () => {
    const result = parse({ totalAmount: f("100") });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.documentType).toBe("UNKNOWN");
  });

  it("ignores non-object field entries", () => {
    const result = parse({ documentType: "FUEL_RECEIPT", liters: "40" });
    expect(result.success).toBe(true);
    if (result.success && result.data.documentType === "FUEL_RECEIPT") {
      expect(result.data.liters).toBeUndefined();
    }
  });
});
