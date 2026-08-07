import { describe, expect, it } from "vitest";
import { documentExtractionSchema } from "./extraction";

/**
 * Provider output is untrusted (§22): these assert the contract rejects
 * malformed shapes rather than letting them reach the review UI.
 */

describe("documentExtractionSchema — fuel receipt", () => {
  it("accepts a full extraction", () => {
    const parsed = documentExtractionSchema.safeParse({
      documentType: "FUEL_RECEIPT",
      date: { value: "2026-08-07", confidence: 0.91, source: "ai" },
      fuelPrice: { value: 1.729, confidence: 0.96, source: "ai" },
      liters: { value: 37.43, confidence: 0.99, source: "ai" },
      totalAmount: { value: 64.72, confidence: 0.98, source: "ai" },
      currency: { value: "EUR", confidence: 0.99, source: "ai" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an extraction with every optional field missing", () => {
    // A sparse result must never fail — §18.
    const parsed = documentExtractionSchema.safeParse({ documentType: "FUEL_RECEIPT" });
    expect(parsed.success).toBe(true);
  });

  it("defaults an omitted source to ai", () => {
    const parsed = documentExtractionSchema.safeParse({
      documentType: "FUEL_RECEIPT",
      liters: { value: 37.43, confidence: 0.99 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.documentType === "FUEL_RECEIPT") {
      expect(parsed.data.liters?.source).toBe("ai");
    }
  });

  it("rejects a non-ISO date", () => {
    const parsed = documentExtractionSchema.safeParse({
      documentType: "FUEL_RECEIPT",
      date: { value: "07.08.2026", confidence: 0.9 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unsupported currency", () => {
    const parsed = documentExtractionSchema.safeParse({
      documentType: "FUEL_RECEIPT",
      currency: { value: "USD", confidence: 0.9 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an out-of-range confidence", () => {
    const parsed = documentExtractionSchema.safeParse({
      documentType: "FUEL_RECEIPT",
      liters: { value: 37.43, confidence: 1.4 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing confidence", () => {
    const parsed = documentExtractionSchema.safeParse({
      documentType: "FUEL_RECEIPT",
      liters: { value: 37.43 },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("documentExtractionSchema — electricity bill", () => {
  it("accepts dual-tariff meter readings", () => {
    // These are the fields the original plan omitted; without them a bill
    // can be extracted but never saved (bill-actions requires both bands).
    const parsed = documentExtractionSchema.safeParse({
      documentType: "ELECTRICITY_BILL",
      periodFrom: { value: "2026-01-01", confidence: 0.95 },
      periodTo: { value: "2026-01-31", confidence: 0.95 },
      dueDate: { value: "2026-02-15", confidence: 0.93 },
      totalAmount: { value: 3300, confidence: 0.97 },
      currency: { value: "MKD", confidence: 0.99 },
      previousReadingHigh: { value: 1000, confidence: 0.9 },
      currentReadingHigh: { value: 1150, confidence: 0.9 },
      previousReadingLow: { value: 500, confidence: 0.88 },
      currentReadingLow: { value: 550, confidence: 0.88 },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a bill with no readings (non-metered account)", () => {
    const parsed = documentExtractionSchema.safeParse({
      documentType: "ELECTRICITY_BILL",
      totalAmount: { value: 3300, confidence: 0.97 },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("documentExtractionSchema — unknown", () => {
  it("accepts a bare UNKNOWN result", () => {
    const parsed = documentExtractionSchema.safeParse({ documentType: "UNKNOWN" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unrecognized documentType", () => {
    const parsed = documentExtractionSchema.safeParse({ documentType: "WATER_BILL" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing documentType", () => {
    const parsed = documentExtractionSchema.safeParse({
      totalAmount: { value: 10, confidence: 0.9 },
    });
    expect(parsed.success).toBe(false);
  });
});
