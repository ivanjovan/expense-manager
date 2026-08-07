import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

// Intl.NumberFormat separates the currency symbol from the number with a
// non-breaking space (U+00A0), not a regular one — asserted explicitly so
// a future refactor can't silently swap it for a breaking space.
const NBSP = " ";

describe("formatMoney", () => {
  it("renders the MKD symbol Intl can't produce on its own (SRS §8.1)", () => {
    expect(formatMoney(12345.5, "MKD", "en")).toBe(`ден${NBSP}12,345.50`);
    expect(formatMoney(12345.5, "MKD", "sr-Latn")).toBe(`12.345,50${NBSP}ден`);
  });

  it("keeps locale-correct grouping and decimal separators for EUR", () => {
    expect(formatMoney(12345.5, "EUR", "en")).toBe(`€${NBSP}12,345.50`);
    expect(formatMoney(12345.5, "EUR", "sr-Latn")).toBe(`12.345,50${NBSP}€`);
  });

  it("accepts Prisma-Decimal-like values via toString()", () => {
    const decimalLike = { toString: () => "99.90" };
    expect(formatMoney(decimalLike, "EUR", "en")).toBe(`€${NBSP}99.90`);
  });

  it("accepts plain numeric strings", () => {
    expect(formatMoney("1000", "MKD", "en")).toBe(`ден${NBSP}1,000.00`);
  });
});
