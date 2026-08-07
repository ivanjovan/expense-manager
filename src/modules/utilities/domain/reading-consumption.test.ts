import { describe, expect, it } from "vitest";
import {
  computeReadingConsumption,
  effectivePricePerUnit,
  highTariffRatio,
} from "./reading-consumption";

describe("computeReadingConsumption", () => {
  it("is current minus previous in the normal case", () => {
    expect(computeReadingConsumption(1000, 1250, false)).toBe(250);
  });

  it("treats current as the post-reset count on rollover", () => {
    expect(computeReadingConsumption(9998, 42, true)).toBe(42);
  });
});

describe("effectivePricePerUnit", () => {
  it("divides amount by total consumption", () => {
    expect(effectivePricePerUnit(3300, 300)).toBeCloseTo(11, 6);
  });

  it("returns null when there's no consumption to divide by", () => {
    expect(effectivePricePerUnit(100, 0)).toBeNull();
  });
});

describe("highTariffRatio", () => {
  it("is the high band's share of total consumption", () => {
    expect(highTariffRatio(150, 50)).toBeCloseTo(0.75, 6);
  });

  it("returns null when there's no consumption at all", () => {
    expect(highTariffRatio(0, 0)).toBeNull();
  });
});
