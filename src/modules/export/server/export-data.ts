import "server-only";
import { prisma } from "@/shared/lib/prisma";
import { requireCurrentUser } from "@/shared/lib/session";
import { ForbiddenError } from "@/shared/lib/session";

/**
 * Household-scoped reads for export. Every query filters on householdId
 * from the re-verified session (§6.4) — an export is the one feature where
 * a scoping mistake hands over the entire dataset in a single file.
 */

export type ExportScope =
  | { kind: "household" }
  | { kind: "vehicle"; id: string }
  | { kind: "account"; id: string };

const BILL_INCLUDE = {
  createdBy: { select: { name: true } },
  readings: true,
} as const;

/**
 * Full household export — owner only, per the §6 role table and §19.
 *
 * The role check is here rather than only in the route so it travels with
 * the data access: this returns every record the household has, and a
 * future second caller must not be able to reach it without passing the
 * same gate.
 */
export async function getFullHouseholdExport() {
  const user = await requireCurrentUser();
  if (user.role !== "OWNER") {
    throw new ForbiddenError("Full household export is owner-only.");
  }
  const householdId = user.householdId;

  const [household, vehicles, fuelEntries, accounts, bills] = await Promise.all([
    prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { name: true, currency: true },
    }),
    prisma.vehicle.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
    prisma.fuelEntry.findMany({
      where: { householdId },
      orderBy: { date: "asc" },
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.utilityAccount.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
    prisma.utilityBill.findMany({
      where: { householdId },
      orderBy: { periodFrom: "asc" },
      include: BILL_INCLUDE,
    }),
  ]);

  return { household, vehicles, fuelEntries, accounts, bills };
}

/** One vehicle's entries. Any member may export what they can already see. */
export async function getVehicleExport(vehicleId: string) {
  const user = await requireCurrentUser();
  const householdId = user.householdId;

  const [household, vehicle] = await Promise.all([
    prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { name: true, currency: true },
    }),
    prisma.vehicle.findFirst({ where: { id: vehicleId, householdId } }),
  ]);
  if (!vehicle) return null;

  const fuelEntries = await prisma.fuelEntry.findMany({
    where: { vehicleId, householdId },
    orderBy: { date: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  return { household, vehicles: [vehicle], fuelEntries, accounts: [], bills: [] };
}

/** One utility account's bills and readings. */
export async function getAccountExport(accountId: string) {
  const user = await requireCurrentUser();
  const householdId = user.householdId;

  const [household, account] = await Promise.all([
    prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { name: true, currency: true },
    }),
    prisma.utilityAccount.findFirst({ where: { id: accountId, householdId } }),
  ]);
  if (!account) return null;

  const bills = await prisma.utilityBill.findMany({
    where: { accountId, householdId },
    orderBy: { periodFrom: "asc" },
    include: BILL_INCLUDE,
  });

  return { household, vehicles: [], fuelEntries: [], accounts: [account], bills };
}

export { ForbiddenError };
