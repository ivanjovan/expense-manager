import { describe, expect, it } from "vitest";
import { computeConsumption, litreWeightedAveragePrice, type ConsumptionEntry } from "./consumption";

/**
 * Hand-verified reference dataset — SRS §20/§21: "Passing this is the
 * definition of 'consumption works'." Every expected figure below was
 * computed independently of consumption.ts before the assertions were
 * written; see the inline arithmetic.
 *
 * Vehicle A, 10 entries, deliberately including:
 *  - a first-ever entry (E1) — must never start a segment
 *  - a partial fill folded into the following full-tank segment (E4)
 *  - a missed-entries flag breaking one segment but not the next (E6)
 *  - a zero-distance/duplicate-odometer entry (E8, ties with E7)
 *  - a trailing partial fill with no closing full tank (E10)
 */
function d(day: string): Date {
  return new Date(`2026-${day}T00:00:00.000Z`);
}

const vehicleAEntries: ConsumptionEntry[] = [
  { id: "E1", date: d("01-01"), odometer: 10000, liters: 40, totalPaid: 60.0, isFullTank: true, missedEntries: false, createdAt: d("01-01") },
  { id: "E2", date: d("01-10"), odometer: 10500, liters: 35, totalPaid: 52.5, isFullTank: true, missedEntries: false, createdAt: d("01-10") },
  { id: "E3", date: d("01-20"), odometer: 11000, liters: 38, totalPaid: 57.0, isFullTank: true, missedEntries: false, createdAt: d("01-20") },
  { id: "E4", date: d("01-25"), odometer: 11200, liters: 10, totalPaid: 15.0, isFullTank: false, missedEntries: false, createdAt: d("01-25") },
  { id: "E5", date: d("02-01"), odometer: 11700, liters: 40, totalPaid: 62.0, isFullTank: true, missedEntries: false, createdAt: d("02-01") },
  { id: "E6", date: d("02-15"), odometer: 12300, liters: 45, totalPaid: 67.5, isFullTank: true, missedEntries: true, createdAt: d("02-15") },
  { id: "E7", date: d("03-01"), odometer: 12800, liters: 42, totalPaid: 67.2, isFullTank: true, missedEntries: false, createdAt: d("03-01") },
  { id: "E8", date: d("03-10"), odometer: 12800, liters: 30, totalPaid: 48.0, isFullTank: true, missedEntries: false, createdAt: d("03-10") },
  { id: "E9", date: d("03-20"), odometer: 13300, liters: 44, totalPaid: 70.4, isFullTank: true, missedEntries: false, createdAt: d("03-20") },
  { id: "E10", date: d("03-25"), odometer: 13500, liters: 20, totalPaid: 32.0, isFullTank: false, missedEntries: false, createdAt: d("03-25") },
];

describe("computeConsumption — Vehicle A reference dataset", () => {
  const result = computeConsumption(vehicleAEntries);

  it("produces exactly 4 valid segments (10 entries, 3 exclusions)", () => {
    // Excluded segments: E1->E2 (starts at first-ever entry),
    // E5->E6 (E6 has missedEntries), E7->E8 (distance 0, duplicate odometer).
    expect(result.segments).toHaveLength(4);
    expect(result.segments.map((s) => `${s.startEntryId}->${s.endEntryId}`)).toEqual([
      "E2->E3",
      "E3->E5",
      "E6->E7",
      "E8->E9",
    ]);
  });

  it("E2->E3: simple full-tank-to-full-tank segment", () => {
    const seg = result.segments[0];
    expect(seg.distanceKm).toBe(500);
    expect(seg.liters).toBe(38);
    expect(seg.cost).toBeCloseTo(57.0, 6);
    expect(seg.consumptionL100km).toBeCloseTo(7.6, 6);
    expect(seg.costPerKm).toBeCloseTo(0.114, 6);
  });

  it("E3->E5: folds the intervening partial fill (E4) into the segment", () => {
    const seg = result.segments[1];
    expect(seg.distanceKm).toBe(700);
    expect(seg.liters).toBe(50); // 10 (E4, partial) + 40 (E5)
    expect(seg.cost).toBeCloseTo(77.0, 6);
    expect(seg.consumptionL100km).toBeCloseTo(7.142857, 5);
    expect(seg.costPerKm).toBeCloseTo(0.11, 6);
  });

  it("E6->E7: valid even though E6 itself carries missedEntries (that only invalidated the PRIOR segment)", () => {
    const seg = result.segments[2];
    expect(seg.distanceKm).toBe(500);
    expect(seg.liters).toBe(42);
    expect(seg.consumptionL100km).toBeCloseTo(8.4, 6);
    expect(seg.costPerKm).toBeCloseTo(0.1344, 6);
  });

  it("E8->E9: valid, immediately after the excluded zero-distance segment", () => {
    const seg = result.segments[3];
    expect(seg.distanceKm).toBe(500);
    expect(seg.liters).toBe(44);
    expect(seg.consumptionL100km).toBeCloseTo(8.8, 6);
    expect(seg.costPerKm).toBeCloseTo(0.1408, 6);
  });

  it("aggregates are distance-weighted, not a mean of segment means", () => {
    // Σliters=174, Σdistance=2200, Σcost=271.60
    expect(result.totalDistanceKm).toBe(2200);
    expect(result.averageConsumptionL100km).toBeCloseTo(7.909091, 5);
    expect(result.averageCostPerKm).toBeCloseTo(0.123455, 5);

    // A naive mean of the four segment consumptions would be wrong:
    const naiveMean =
      result.segments.reduce((sum, s) => sum + s.consumptionL100km, 0) / result.segments.length;
    expect(result.averageConsumptionL100km).not.toBeCloseTo(naiveMean, 2);
  });

  it("basis disclosure: 8 of 10 entries contributed (excludes E1 and trailing E10)", () => {
    expect(result.totalEntryCount).toBe(10);
    expect(result.includedEntryCount).toBe(8);
  });
});

describe("computeConsumption — insufficient data", () => {
  it("returns null averages when only the first-ever entry pair exists", () => {
    const vehicleB: ConsumptionEntry[] = [
      { id: "B1", date: d("05-01"), odometer: 5000, liters: 40, totalPaid: 60, isFullTank: true, missedEntries: false, createdAt: d("05-01") },
      { id: "B2", date: d("05-10"), odometer: 5400, liters: 32, totalPaid: 48, isFullTank: true, missedEntries: false, createdAt: d("05-10") },
    ];
    const result = computeConsumption(vehicleB);
    // Two full-tank entries exist, but the only possible segment starts
    // at the vehicle's first-ever entry, so it's excluded — this is the
    // "fewer than two valid segments" empty state, not a data-count check.
    expect(result.segments).toHaveLength(0);
    expect(result.averageConsumptionL100km).toBeNull();
    expect(result.averageCostPerKm).toBeNull();
    expect(result.totalDistanceKm).toBe(0);
  });

  it("returns null averages for an empty entry list", () => {
    const result = computeConsumption([]);
    expect(result.segments).toEqual([]);
    expect(result.averageConsumptionL100km).toBeNull();
  });
});

describe("litreWeightedAveragePrice", () => {
  it("weights by litres, not a mean of per-entry prices (Vehicle A dataset)", () => {
    // Σliters=344, Σcost=531.60 across all 10 entries (full and partial).
    const avg = litreWeightedAveragePrice(vehicleAEntries);
    expect(avg).toBeCloseTo(1.545349, 5);
  });

  it("returns null when there are no litres at all", () => {
    expect(litreWeightedAveragePrice([])).toBeNull();
  });
});
