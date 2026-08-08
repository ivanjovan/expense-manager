import { describe, expect, it } from "vitest";
import {
  parseDecimal,
  normalizeDate,
  normalizeCurrency,
  normalizeConfidence,
  isLowConfidence,
} from "./normalize";

describe("parseDecimal", () => {
  it("parses European decimal-comma values", () => {
    expect(parseDecimal("1,45")).toBeCloseTo(1.45, 6);
    expect(parseDecimal("64,72")).toBeCloseTo(64.72, 6);
  });

  it("parses European dotted-thousands with decimal comma", () => {
    expect(parseDecimal("1.234,56")).toBeCloseTo(1234.56, 6);
    expect(parseDecimal("12.345,50")).toBeCloseTo(12345.5, 6);
  });

  it("parses Anglo comma-thousands with decimal point", () => {
    expect(parseDecimal("1,234.56")).toBeCloseTo(1234.56, 6);
  });

  it("reads a lone separator with exactly 3 trailing digits as thousands", () => {
    expect(parseDecimal("1.234")).toBeCloseTo(1234, 6);
    expect(parseDecimal("3,300")).toBeCloseTo(3300, 6);
  });

  it("reads a lone separator with 1-2 trailing digits as a decimal", () => {
    expect(parseDecimal("1,7")).toBeCloseTo(1.7, 6);
    expect(parseDecimal("37,43")).toBeCloseTo(37.43, 6);
  });

  it("resolves the ambiguous 3-digit case by the caller's `fractional` hint", () => {
    // A fuel price and a denar total can look identical; the two readings
    // differ by 1000x, so the caller states which it expects.
    expect(parseDecimal("1.729")).toBeCloseTo(1729, 6);
    expect(parseDecimal("1.729", { fractional: true })).toBeCloseTo(1.729, 6);
    expect(parseDecimal("1,729", { fractional: true })).toBeCloseTo(1.729, 6);
  });

  it("leaves unambiguous values unchanged regardless of the hint", () => {
    // Both separators present -> last one wins; hint is irrelevant.
    expect(parseDecimal("1.234,56", { fractional: true })).toBeCloseTo(1234.56, 6);
    // 1-2 trailing digits are already decimal.
    expect(parseDecimal("64,72", { fractional: true })).toBeCloseTo(64.72, 6);
  });

  it("strips currency symbols and stray text", () => {
    expect(parseDecimal("€ 64,72")).toBeCloseTo(64.72, 6);
    expect(parseDecimal("3.300,00 ден")).toBeCloseTo(3300, 6);
    expect(parseDecimal("EUR 1,45")).toBeCloseTo(1.45, 6);
  });

  it("passes finite numbers through untouched", () => {
    expect(parseDecimal(42.5)).toBe(42.5);
  });

  it("returns null for unparseable input", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal("n/a")).toBeNull();
    expect(parseDecimal(Number.NaN)).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("passes ISO dates through", () => {
    expect(normalizeDate("2026-08-07")).toBe("2026-08-07");
  });

  it("reads ambiguous numeric dates day-first", () => {
    expect(normalizeDate("07.08.2026")).toBe("2026-08-07");
    expect(normalizeDate("7/8/2026")).toBe("2026-08-07");
    expect(normalizeDate("07-08-2026")).toBe("2026-08-07");
  });

  it("expands 2-digit years into the 2000s", () => {
    expect(normalizeDate("07.08.26")).toBe("2026-08-07");
  });

  it("zero-pads single-digit day and month", () => {
    expect(normalizeDate("1.2.2026")).toBe("2026-02-01");
  });

  it("rejects impossible calendar dates rather than rolling them over", () => {
    expect(normalizeDate("31.02.2026")).toBeNull();
    expect(normalizeDate("07.13.2026")).toBeNull();
    expect(normalizeDate("2026-02-31")).toBeNull();
  });

  it("returns null for unrecognized formats", () => {
    expect(normalizeDate("August 7th")).toBeNull();
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });
});

describe("normalizeCurrency", () => {
  it("recognizes EUR by code and symbol", () => {
    expect(normalizeCurrency("EUR")).toBe("EUR");
    expect(normalizeCurrency("€")).toBe("EUR");
    expect(normalizeCurrency("eur")).toBe("EUR");
  });

  it("recognizes MKD by code and denar symbol", () => {
    expect(normalizeCurrency("MKD")).toBe("MKD");
    expect(normalizeCurrency("ден")).toBe("MKD");
    expect(normalizeCurrency("ДЕН")).toBe("MKD");
  });

  it("returns null for unsupported or missing currencies", () => {
    expect(normalizeCurrency("USD")).toBeNull();
    expect(normalizeCurrency("$")).toBeNull();
    expect(normalizeCurrency(null)).toBeNull();
  });
});

  it("recognizes Cyrillic currency codes", () => {
    // "МКД" and "MKD" render identically but share no codepoints; a
    // Macedonian bill prints the Cyrillic form.
    expect(normalizeCurrency("МКД")).toBe("MKD");
    expect(normalizeCurrency("ЕУР")).toBe("EUR");
  });

  it("still recognizes the Latin forms", () => {
    expect(normalizeCurrency("MKD")).toBe("MKD");
    expect(normalizeCurrency("EUR")).toBe("EUR");
  });

describe("normalizeConfidence", () => {
  it("passes 0..1 fractions through", () => {
    expect(normalizeConfidence(0.98)).toBeCloseTo(0.98, 6);
  });

  it("converts percentages to fractions", () => {
    expect(normalizeConfidence(98)).toBeCloseTo(0.98, 6);
    expect(normalizeConfidence(150)).toBe(1);
  });

  it("floors invalid or negative input at 0", () => {
    expect(normalizeConfidence(-1)).toBe(0);
    expect(normalizeConfidence("nope")).toBe(0);
    expect(normalizeConfidence(undefined)).toBe(0);
  });
});

describe("isLowConfidence", () => {
  it("flags values below the threshold", () => {
    expect(isLowConfidence(0.5)).toBe(true);
    expect(isLowConfidence(0.74)).toBe(true);
  });

  it("accepts values at or above the threshold", () => {
    expect(isLowConfidence(0.75)).toBe(false);
    expect(isLowConfidence(0.99)).toBe(false);
  });
});
