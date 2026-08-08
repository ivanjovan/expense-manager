import { describe, expect, it } from "vitest";
import { applyBillExtraction, applyFuelExtraction } from "./apply";
import type {
  ElectricityBillExtraction,
  FuelReceiptExtraction,
} from "../schemas/extraction";

const f = <T,>(value: T, confidence = 0.95) => ({ value, confidence, source: "ai" as const });

function fuel(overrides: Partial<FuelReceiptExtraction> = {}): FuelReceiptExtraction {
  return { documentType: "FUEL_RECEIPT", ...overrides } as FuelReceiptExtraction;
}
function bill(overrides: Partial<ElectricityBillExtraction> = {}): ElectricityBillExtraction {
  return { documentType: "ELECTRICITY_BILL", ...overrides } as ElectricityBillExtraction;
}

describe("applyFuelExtraction", () => {
  it("maps a complete receipt without deriving anything", () => {
    const result = applyFuelExtraction(
      fuel({
        date: f("2026-08-05"),
        fuelPrice: f(85.5),
        liters: f(41.226),
        totalAmount: f(3524.82),
        currency: f("MKD"),
        stationName: f("Makpetrol"),
      }),
      "MKD"
    );

    expect(result.values.date).toBe("2026-08-05");
    expect(result.values.fuelPrice).toBe("85.5");
    expect(result.values.liters).toBe("41.226");
    expect(result.values.totalPaid).toBe("3524.82");
    expect(result.values.station).toBe("Makpetrol");
    // All three printed — leave NONE so the discrepancy check can still fire.
    expect(result.derivedField).toBe("NONE");
    expect(result.currencyMismatch).toBe(false);
  });

  it("derives litres when only price and total were printed", () => {
    const result = applyFuelExtraction(
      fuel({ fuelPrice: f(85.5), totalAmount: f(1710) }),
      "MKD"
    );
    expect(result.derivedField).toBe("LITERS");
    expect(result.values.liters).toBe("20");
  });

  it("derives the total when only price and litres were printed", () => {
    const result = applyFuelExtraction(fuel({ fuelPrice: f(2), liters: f(10) }), "EUR");
    expect(result.derivedField).toBe("TOTAL_PAID");
    expect(result.values.totalPaid).toBe("20");
  });

  it("derives the unit price when only litres and total were printed", () => {
    const result = applyFuelExtraction(fuel({ liters: f(20), totalAmount: f(1710) }), "MKD");
    expect(result.derivedField).toBe("FUEL_PRICE");
    expect(result.values.fuelPrice).toBe("85.5");
  });

  it("does not derive from a zero divisor", () => {
    // A misread "0 litres" would otherwise produce Infinity in the form.
    const result = applyFuelExtraction(fuel({ liters: f(0), totalAmount: f(1710) }), "MKD");
    expect(result.derivedField).toBe("NONE");
    expect(result.values.fuelPrice).toBeUndefined();
  });

  it("derives nothing when only one value was printed", () => {
    const result = applyFuelExtraction(fuel({ totalAmount: f(1710) }), "MKD");
    expect(result.derivedField).toBe("NONE");
    expect(result.values.liters).toBeUndefined();
    expect(result.values.fuelPrice).toBeUndefined();
  });

  it("flags a foreign currency as a mismatch", () => {
    const result = applyFuelExtraction(fuel({ currency: f("EUR") }), "MKD");
    expect(result.currency).toBe("EUR");
    expect(result.currencyMismatch).toBe(true);
  });

  it("does not flag a mismatch when the document has no currency", () => {
    // Absent currency is normal on a till receipt — it must not block saving.
    const result = applyFuelExtraction(fuel({ totalAmount: f(1710) }), "MKD");
    expect(result.currency).toBeNull();
    expect(result.currencyMismatch).toBe(false);
  });

  it("collects low-confidence fields", () => {
    const result = applyFuelExtraction(
      fuel({ fuelPrice: f(85.5, 0.99), liters: f(41.2, 0.4), totalAmount: f(3524, 0.6) }),
      "MKD"
    );
    expect(result.lowConfidenceFields).toEqual(["liters", "totalPaid"]);
    expect(result.confidence.fuelPrice).toBe(0.99);
  });

  it("ignores confidence for fields that were not extracted", () => {
    const result = applyFuelExtraction(fuel({}), "MKD");
    expect(result.confidence).toEqual({});
    expect(result.lowConfidenceFields).toEqual([]);
  });

  it("always reports that the odometer still needs entering", () => {
    // No fuel receipt prints an odometer, and our consumption engine is
    // useless without one.
    expect(applyFuelExtraction(fuel({}), "MKD").requiresOdometer).toBe(true);
  });

  it("composes fuel type, receipt number and time into notes", () => {
    const result = applyFuelExtraction(
      fuel({ fuelType: f("Eurodiesel"), receiptNumber: f("0042318"), time: f("17:42") }),
      "MKD"
    );
    expect(result.values.notes).toBe("Eurodiesel · #0042318 · 17:42");
  });

  it("leaves notes empty when there is nothing to record", () => {
    expect(applyFuelExtraction(fuel({}), "MKD").values.notes).toBeUndefined();
  });
});

describe("applyBillExtraction", () => {
  const full = bill({
    periodFrom: f("2026-07-01"),
    periodTo: f("2026-07-31"),
    issueDate: f("2026-08-03"),
    dueDate: f("2026-08-20"),
    totalAmount: f(3187),
    currency: f("MKD"),
    invoiceNumber: f("2026-07-8841203"),
    previousReadingHigh: f(24180),
    currentReadingHigh: f(24476),
    previousReadingLow: f(11902),
    currentReadingLow: f(12043),
  });

  it("maps a complete dual-tariff bill", () => {
    const result = applyBillExtraction(full, "MKD", true);
    expect(result.values.periodFrom).toBe("2026-07-01");
    expect(result.values.periodTo).toBe("2026-07-31");
    expect(result.values.dueDate).toBe("2026-08-20");
    expect(result.values.amount).toBe("3187");
    expect(result.values.previousReadingHigh).toBe("24180");
    expect(result.values.currentReadingLow).toBe("12043");
    expect(result.missingReadings).toBe(false);
    expect(result.currencyMismatch).toBe(false);
  });

  it("flags missing readings when the account tracks them", () => {
    const partial = bill({
      totalAmount: f(3187),
      previousReadingHigh: f(24180),
      currentReadingHigh: f(24476),
    });
    expect(applyBillExtraction(partial, "MKD", true).missingReadings).toBe(true);
  });

  it("does not flag missing readings for an account that doesn't track them", () => {
    const partial = bill({ totalAmount: f(3187) });
    expect(applyBillExtraction(partial, "MKD", false).missingReadings).toBe(false);
  });

  it("flags a foreign currency as a mismatch", () => {
    const result = applyBillExtraction(bill({ currency: f("EUR") }), "MKD", false);
    expect(result.currencyMismatch).toBe(true);
  });

  it("collects low-confidence reading fields", () => {
    const result = applyBillExtraction(
      bill({ currentReadingLow: f(12043, 0.58), previousReadingLow: f(11902, 0.9) }),
      "MKD",
      true
    );
    expect(result.lowConfidenceFields).toEqual(["currentReadingLow"]);
  });

  it("keeps this period's charge separate from carried-over debt", () => {
    // The whole point: amount drives every chart, debt drives none. If debt
    // leaked into amount, an unpaid bill would be counted in its own month
    // and again in the month it was settled.
    const result = applyBillExtraction(
      bill({ totalAmount: f(3187), previousDebt: f(1240), totalDue: f(4427), taxAmount: f(486.15) }),
      "MKD",
      false
    );
    expect(result.values.amount).toBe("3187");
    expect(result.values.previousDebt).toBe("1240");
    expect(result.values.taxAmount).toBe("486.15");
    expect(result.totalDue).toBe(4427);
    expect(result.chargesDoNotReconcile).toBe(false);
  });

  it("flags a bill whose own figures do not add up", () => {
    // 3187 + 1240 = 4427, not 5000 — a digit was misread somewhere, and
    // which one is not knowable from here.
    const result = applyBillExtraction(
      bill({ totalAmount: f(3187), previousDebt: f(1240), totalDue: f(5000) }),
      "MKD",
      false
    );
    expect(result.chargesDoNotReconcile).toBe(true);
  });

  it("tolerates rounding in the printed total", () => {
    const result = applyBillExtraction(
      bill({ totalAmount: f(3187.005), previousDebt: f(1240), totalDue: f(4427.01) }),
      "MKD",
      false
    );
    expect(result.chargesDoNotReconcile).toBe(false);
  });

  it("treats an absent previous debt as zero when reconciling", () => {
    const result = applyBillExtraction(
      bill({ totalAmount: f(3187), totalDue: f(3187) }),
      "MKD",
      false
    );
    expect(result.chargesDoNotReconcile).toBe(false);
    expect(result.values.previousDebt).toBeUndefined();
  });

  it("cannot reconcile without a printed total, and does not pretend to", () => {
    const result = applyBillExtraction(
      bill({ totalAmount: f(3187), previousDebt: f(1240) }),
      "MKD",
      false
    );
    expect(result.totalDue).toBeNull();
    expect(result.chargesDoNotReconcile).toBe(false);
  });

  it("does not reconcile when the period charge was not read", () => {
    // Only totalDue and debt present: amount is unknown, so there is
    // nothing to contradict.
    const result = applyBillExtraction(
      bill({ previousDebt: f(1240), totalDue: f(4427) }),
      "MKD",
      false
    );
    expect(result.chargesDoNotReconcile).toBe(false);
  });

  it("flags low confidence on the charge fields too", () => {
    const result = applyBillExtraction(
      bill({ previousDebt: f(1240, 0.4), taxAmount: f(486, 0.5) }),
      "MKD",
      false
    );
    expect(result.lowConfidenceFields).toEqual(["taxAmount", "previousDebt"]);
  });

  it("produces an empty application from a bare extraction", () => {
    const result = applyBillExtraction(bill({}), "MKD", true);
    expect(result.values.amount).toBeUndefined();
    expect(result.missingReadings).toBe(true);
    expect(result.currencyMismatch).toBe(false);
  });
});
