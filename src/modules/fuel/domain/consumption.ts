/**
 * Fuel consumption engine — SRS §10.4 (normative). Pure functions only:
 * no Prisma, no React, no I/O. This is the part of the app that has to be
 * right, since a confidently wrong number here is worse than the
 * spreadsheet this app replaces.
 */

export interface ConsumptionEntry {
  id: string;
  date: Date;
  odometer: number;
  liters: number;
  totalPaid: number;
  isFullTank: boolean;
  missedEntries: boolean;
  /** Tie-break for same date/odometer — see the ordering rule below. */
  createdAt: Date;
}

export interface Segment {
  /** The full-tank entry the segment starts from (exclusive of its own fuel). */
  startEntryId: string;
  /** The full-tank entry the segment ends at (inclusive). */
  endEntryId: string;
  startDate: Date;
  endDate: Date;
  distanceKm: number;
  liters: number;
  cost: number;
  consumptionL100km: number;
  costPerKm: number;
}

export interface ConsumptionResult {
  segments: Segment[];
  /** Distance-weighted, never a mean of per-segment figures — see SRS §10.4. */
  averageConsumptionL100km: number | null;
  averageCostPerKm: number | null;
  totalDistanceKm: number;
  /** Entries that contributed to at least one valid segment (basis disclosure). */
  includedEntryCount: number;
  totalEntryCount: number;
}

/** Order entries by odometer ascending, tie-broken by date then createdAt. */
function sortEntries(entries: ConsumptionEntry[]): ConsumptionEntry[] {
  return [...entries].sort((a, b) => {
    if (a.odometer !== b.odometer) return a.odometer - b.odometer;
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function computeConsumption(rawEntries: ConsumptionEntry[]): ConsumptionResult {
  const sorted = sortEntries(rawEntries);
  const segments: Segment[] = [];
  const includedEntryIds = new Set<string>();

  let lastFullTankIndex: number | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (!entry.isFullTank) continue;

    if (lastFullTankIndex === null) {
      lastFullTankIndex = i;
      continue;
    }

    const startIndex = lastFullTankIndex;
    const endIndex = i;
    lastFullTankIndex = i; // next segment starts here regardless of this one's validity

    // A segment starting at the vehicle's first-ever entry is invalid: we
    // have no record of consumption before that entry, so we can't trust
    // its odometer reading as a true zero-consumption baseline.
    if (startIndex === 0) continue;

    const start = sorted[startIndex];
    const end = sorted[endIndex];
    const distanceKm = end.odometer - start.odometer;
    if (distanceKm <= 0) continue;

    // Entries strictly after S through E — S's own fuel belongs to the
    // *previous* segment (or is excluded if S is the first entry).
    const included = sorted.slice(startIndex + 1, endIndex + 1);
    if (included.some((e) => e.missedEntries)) continue;

    const liters = included.reduce((sum, e) => sum + e.liters, 0);
    const cost = included.reduce((sum, e) => sum + e.totalPaid, 0);

    segments.push({
      startEntryId: start.id,
      endEntryId: end.id,
      startDate: start.date,
      endDate: end.date,
      distanceKm,
      liters,
      cost,
      consumptionL100km: (liters / distanceKm) * 100,
      costPerKm: cost / distanceKm,
    });

    includedEntryIds.add(start.id);
    for (const e of included) includedEntryIds.add(e.id);
  }

  const totalDistanceKm = segments.reduce((sum, s) => sum + s.distanceKm, 0);
  const totalLiters = segments.reduce((sum, s) => sum + s.liters, 0);
  const totalCost = segments.reduce((sum, s) => sum + s.cost, 0);

  return {
    segments,
    averageConsumptionL100km:
      totalDistanceKm > 0 ? (totalLiters / totalDistanceKm) * 100 : null,
    averageCostPerKm: totalDistanceKm > 0 ? totalCost / totalDistanceKm : null,
    totalDistanceKm,
    includedEntryCount: includedEntryIds.size,
    totalEntryCount: sorted.length,
  };
}

/** Litre-weighted average price — SRS §10.5. Runs over *all* entries
 * (not just full-tank ones), since every purchase has a price regardless
 * of whether the tank was filled. */
export function litreWeightedAveragePrice(
  entries: Pick<ConsumptionEntry, "liters" | "totalPaid">[]
): number | null {
  const totalLiters = entries.reduce((sum, e) => sum + e.liters, 0);
  if (totalLiters <= 0) return null;
  const totalCost = entries.reduce((sum, e) => sum + e.totalPaid, 0);
  return totalCost / totalLiters;
}
