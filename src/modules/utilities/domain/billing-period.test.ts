import { describe, expect, it } from "vitest";
import { groupBillsByMonth, groupBillsByYear } from "./billing-period";

describe("groupBillsByMonth", () => {
  it("sums amount and kwh within the same UTC month and sorts chronologically", () => {
    const result = groupBillsByMonth([
      { periodFrom: new Date("2026-02-01T00:00:00.000Z"), amount: 99, kwh: 700 },
      { periodFrom: new Date("2026-01-01T00:00:00.000Z"), amount: 30, kwh: 250 },
      { periodFrom: new Date("2026-01-15T00:00:00.000Z"), amount: 10, kwh: 50 },
    ]);
    expect(result).toEqual([
      { month: "2026-01", amount: 40, kwh: 300 },
      { month: "2026-02", amount: 99, kwh: 700 },
    ]);
  });
});

describe("groupBillsByYear", () => {
  it("sums amount and kwh within the same UTC year and sorts chronologically", () => {
    const result = groupBillsByYear([
      { periodFrom: new Date("2026-01-01T00:00:00.000Z"), amount: 30, kwh: 250 },
      { periodFrom: new Date("2025-12-01T00:00:00.000Z"), amount: 20, kwh: 200 },
    ]);
    expect(result).toEqual([
      { year: 2025, amount: 20, kwh: 200 },
      { year: 2026, amount: 30, kwh: 250 },
    ]);
  });
});
