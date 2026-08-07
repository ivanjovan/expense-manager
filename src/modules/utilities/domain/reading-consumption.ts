/**
 * Meter-reading consumption — SRS §11.3. Pure functions, no Prisma/React.
 */

/**
 * Consumption between two meter readings. Normally `current - previous`;
 * validated elsewhere (schema + form) to require `current >= previous`
 * unless `meterRollover` is set.
 *
 * On rollover the meter wrapped past its maximum and reset — this schema
 * has no "max digits" field to compute the exact pre-reset remainder, so
 * the documented, simpler assumption is that the meter reset to zero at
 * the previous reading and `current` is the count since: consumption =
 * `current`. This slightly overstates true consumption by whatever was
 * left unread at rollover, which is the same trade-off most household
 * trackers make without a digit-count field.
 */
export function computeReadingConsumption(
  previous: number,
  current: number,
  meterRollover: boolean
): number {
  if (meterRollover) return current;
  return current - previous;
}

/** Effective price per unit (kWh/m³) — amount divided by total consumption
 * across all bands on the bill. */
export function effectivePricePerUnit(
  amount: number,
  totalConsumption: number
): number | null {
  if (totalConsumption <= 0) return null;
  return amount / totalConsumption;
}

/** Share of consumption in the high-tariff band, 0–1. Tells the household
 * whether shifting load into the cheap window is worth it — SRS §11.3. */
export function highTariffRatio(high: number, low: number): number | null {
  const total = high + low;
  if (total <= 0) return null;
  return high / total;
}
