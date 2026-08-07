import { describe, expect, it } from "vitest";
import { groupMonthly } from "./monthly";

describe("groupMonthly", () => {
  it("sums litres and spending within the same UTC month and sorts chronologically", () => {
    const result = groupMonthly([
      { date: new Date("2026-02-15T00:00:00.000Z"), liters: 10, totalPaid: 15 },
      { date: new Date("2026-01-05T00:00:00.000Z"), liters: 40, totalPaid: 60 },
      { date: new Date("2026-01-20T00:00:00.000Z"), liters: 35, totalPaid: 52.5 },
    ]);
    expect(result).toEqual([
      { month: "2026-01", liters: 75, spending: 112.5 },
      { month: "2026-02", liters: 10, spending: 15 },
    ]);
  });

  it("returns an empty array for no entries", () => {
    expect(groupMonthly([])).toEqual([]);
  });
});
