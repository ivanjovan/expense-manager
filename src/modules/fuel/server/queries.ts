import "server-only";
import { prisma } from "@/shared/lib/prisma";
import { requireCurrentUser } from "@/shared/lib/session";
import {
  computeConsumption,
  litreWeightedAveragePrice,
  type ConsumptionEntry,
} from "../domain/consumption";

export async function getVehicles(options: { includeArchived?: boolean } = {}) {
  const user = await requireCurrentUser();
  return prisma.vehicle.findMany({
    where: {
      householdId: user.householdId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { fuelEntries: true } } },
  });
}

export async function getVehicle(vehicleId: string) {
  const user = await requireCurrentUser();
  return prisma.vehicle.findFirst({
    where: { id: vehicleId, householdId: user.householdId },
  });
}

export async function getFuelEntry(entryId: string) {
  const user = await requireCurrentUser();
  return prisma.fuelEntry.findFirst({
    where: { id: entryId, householdId: user.householdId },
  });
}

/** All entries for one vehicle, household-scoped, chronological. Small
 * enough per SRS §18's scale target (~2,000 fuel entries per household
 * over 10 years) to load in full — the consumption engine needs the
 * complete ordered list in memory regardless, and the entries table uses
 * the same fetch (client-side sort/filter/paginate, see FuelEntriesTable). */
export async function getFuelEntriesForVehicle(vehicleId: string) {
  const user = await requireCurrentUser();
  return prisma.fuelEntry.findMany({
    where: { vehicleId, householdId: user.householdId },
    orderBy: { date: "asc" },
    include: { createdBy: { select: { name: true } } },
  });
}

interface FuelEntryLike {
  id: string;
  date: Date;
  odometer: number;
  liters: unknown; // Prisma.Decimal — only Number()'d here
  totalPaid: unknown;
  isFullTank: boolean;
  missedEntries: boolean;
  createdAt: Date;
}

function toConsumptionEntries(entries: FuelEntryLike[]): ConsumptionEntry[] {
  return entries.map((e) => ({
    id: e.id,
    date: e.date,
    odometer: e.odometer,
    liters: Number(e.liters),
    totalPaid: Number(e.totalPaid),
    isFullTank: e.isFullTank,
    missedEntries: e.missedEntries,
    createdAt: e.createdAt,
  }));
}

export async function getVehicleStats(vehicleId: string) {
  const entries = await getFuelEntriesForVehicle(vehicleId);
  const consumptionEntries = toConsumptionEntries(entries);
  const consumption = computeConsumption(consumptionEntries);
  const averageFuelPrice = litreWeightedAveragePrice(consumptionEntries);
  const totalLiters = consumptionEntries.reduce((sum, e) => sum + e.liters, 0);
  const totalSpent = consumptionEntries.reduce((sum, e) => sum + e.totalPaid, 0);
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  return {
    entryCount: entries.length,
    totalLiters,
    totalSpent,
    averageFuelPrice,
    consumption,
    lastEntry,
    entries,
  };
}

/** Household-wide fuel summary for the dashboard (SRS §12) — combines
 * every active vehicle's entries. */
export async function getHouseholdFuelSummary() {
  const user = await requireCurrentUser();
  const vehicles = await prisma.vehicle.findMany({
    where: { householdId: user.householdId, archivedAt: null },
  });

  if (vehicles.length === 0) {
    return { hasVehicles: false as const };
  }

  const allEntries = await prisma.fuelEntry.findMany({
    where: { householdId: user.householdId, vehicleId: { in: vehicles.map((v) => v.id) } },
    orderBy: { date: "asc" },
    include: { vehicle: { select: { name: true } } },
  });

  // Consumption must be computed per vehicle (odometer sequences aren't
  // comparable across vehicles) and then combined by distance-weighting.
  let totalDistanceKm = 0;
  let totalConsumptionLiters = 0;
  let totalCostPerKmCost = 0;
  for (const vehicle of vehicles) {
    const vehicleEntries = toConsumptionEntries(
      allEntries.filter((e) => e.vehicleId === vehicle.id)
    );
    const result = computeConsumption(vehicleEntries);
    totalDistanceKm += result.totalDistanceKm;
    for (const seg of result.segments) {
      totalConsumptionLiters += seg.liters;
      totalCostPerKmCost += seg.cost;
    }
  }

  const totalLiters = allEntries.reduce((sum, e) => sum + Number(e.liters), 0);
  const totalSpent = allEntries.reduce((sum, e) => sum + Number(e.totalPaid), 0);
  const lastEntry = allEntries.length > 0 ? allEntries[allEntries.length - 1] : null;

  return {
    hasVehicles: true as const,
    vehicleCount: vehicles.length,
    totalLiters,
    totalSpent,
    averageFuelPrice: totalLiters > 0 ? totalSpent / totalLiters : null,
    averageConsumptionL100km:
      totalDistanceKm > 0 ? (totalConsumptionLiters / totalDistanceKm) * 100 : null,
    averageCostPerKm: totalDistanceKm > 0 ? totalCostPerKmCost / totalDistanceKm : null,
    totalDistanceKm,
    lastEntry,
  };
}
