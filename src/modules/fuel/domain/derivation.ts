/**
 * Fuel entry value derivation — SRS §10.3. The user enters any two of
 * {price, litres, total}; the third is computed live in the form.
 */

export type DerivedField = "NONE" | "FUEL_PRICE" | "LITERS" | "TOTAL_PAID";

export interface FuelValues {
  fuelPrice: number;
  liters: number;
  totalPaid: number;
}

/** Recomputes whichever field is marked derived from the other two.
 * Used both live in the form and to re-derive on edit, so re-editing an
 * entry recomputes the same field rather than guessing which changed. */
export function deriveFuelValue(
  values: FuelValues,
  derivedField: Exclude<DerivedField, "NONE">
): number {
  switch (derivedField) {
    case "FUEL_PRICE":
      return values.liters > 0 ? values.totalPaid / values.liters : 0;
    case "LITERS":
      return values.fuelPrice > 0 ? values.totalPaid / values.fuelPrice : 0;
    case "TOTAL_PAID":
      return values.fuelPrice * values.liters;
  }
}

/**
 * True if all three values were entered (derivedField === "NONE") and they
 * disagree beyond tolerance: 0.5% or 2 minor currency units, whichever is
 * larger. Pumps round; a receipt is the source of truth, so this is a
 * warning, never a blocking validation error.
 */
export function hasFuelValueDiscrepancy(values: FuelValues): boolean {
  const expectedTotal = values.fuelPrice * values.liters;
  const diff = Math.abs(expectedTotal - values.totalPaid);
  const tolerance = Math.max(expectedTotal * 0.005, 0.02);
  return diff > tolerance;
}
