import { describe, expect, it } from "vitest";
import { deriveFuelValue, hasFuelValueDiscrepancy } from "./derivation";

describe("deriveFuelValue", () => {
  it("derives total from price and litres", () => {
    expect(deriveFuelValue({ fuelPrice: 1.5, liters: 40, totalPaid: 0 }, "TOTAL_PAID")).toBeCloseTo(60, 6);
  });

  it("derives litres from price and total", () => {
    expect(deriveFuelValue({ fuelPrice: 1.5, liters: 0, totalPaid: 60 }, "LITERS")).toBeCloseTo(40, 6);
  });

  it("derives price from litres and total", () => {
    expect(deriveFuelValue({ fuelPrice: 0, liters: 40, totalPaid: 60 }, "FUEL_PRICE")).toBeCloseTo(1.5, 6);
  });

  it("returns 0 rather than dividing by zero", () => {
    expect(deriveFuelValue({ fuelPrice: 0, liters: 0, totalPaid: 60 }, "FUEL_PRICE")).toBe(0);
    expect(deriveFuelValue({ fuelPrice: 1.5, liters: 0, totalPaid: 0 }, "LITERS")).toBe(0);
  });
});

describe("hasFuelValueDiscrepancy", () => {
  it("is false when all three values agree exactly", () => {
    expect(hasFuelValueDiscrepancy({ fuelPrice: 1.5, liters: 40, totalPaid: 60 })).toBe(false);
  });

  it("is false within tolerance (pump rounding)", () => {
    // expected 60.00, actual 60.05 -> diff 0.05, tolerance = max(0.3, 0.02) = 0.3
    expect(hasFuelValueDiscrepancy({ fuelPrice: 1.5, liters: 40, totalPaid: 60.05 })).toBe(false);
  });

  it("is true beyond tolerance", () => {
    // expected 60.00, actual 65.00 -> diff 5, tolerance = max(0.3, 0.02) = 0.3
    expect(hasFuelValueDiscrepancy({ fuelPrice: 1.5, liters: 40, totalPaid: 65 })).toBe(true);
  });

  it("uses the 2-minor-unit floor for small amounts", () => {
    // expected 1.00, actual 1.03 -> diff 0.03, tolerance = max(0.005, 0.02) = 0.02 -> exceeds
    expect(hasFuelValueDiscrepancy({ fuelPrice: 1, liters: 1, totalPaid: 1.03 })).toBe(true);
    // expected 1.00, actual 1.01 -> diff 0.01, tolerance = max(0.005, 0.02) = 0.02 -> within
    expect(hasFuelValueDiscrepancy({ fuelPrice: 1, liters: 1, totalPaid: 1.01 })).toBe(false);
  });
});
