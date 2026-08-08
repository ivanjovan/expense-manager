import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/shared/lib/auth-errors";
import type { User } from "@/generated/prisma/client";

/**
 * The tenancy invariant, end to end against a real database.
 *
 * Every household-scoped read and write in this app is guarded by the same
 * hand-written clause — `where: { id, householdId: user.householdId }`. That
 * pattern is the entire authorization model, and until now nothing checked
 * it: a single omission in a new query would hand one household another's
 * records, and every unit test would still pass.
 *
 * So this drives the real Server Actions against real rows, as a user who is
 * a legitimate, fully authenticated member of a *different* household. That
 * is the actual threat here — not an anonymous attacker (the proxy and
 * `requireCurrentUser` already stop those) but a signed-in user reaching
 * sideways with an id they guessed, or kept from a shared link.
 *
 * Assertions insist on the exact code `common.notFound` rather than merely
 * "not ok". A malformed payload returns `validation.required`, so demanding
 * the tenancy code is what stops this suite from passing vacuously because
 * the fixture data was wrong.
 *
 * Requires Postgres, so it is opt-in: CI sets RUN_DB_TESTS=1 against its
 * service container. Locally, `npm run db:up && RUN_DB_TESTS=1 npm test`.
 */

const DB_TESTS_ENABLED = process.env.RUN_DB_TESTS === "1";

/** The user the mocked session returns; swapped per assertion. */
let actingUser: User;

// Mocked at the session seam rather than at Auth.js: what is under test is
// the household filter in each action, not JWT verification. Both `./session`
// (from action-guard) and `@/shared/lib/session` resolve to this same module.
vi.mock("@/shared/lib/session", () => ({
  requireCurrentUser: async () => {
    if (!actingUser) throw new UnauthenticatedError("no acting user set");
    return actingUser;
  },
  requireOwner: async () => {
    if (!actingUser) throw new UnauthenticatedError("no acting user set");
    if (actingUser.role !== "OWNER") throw new ForbiddenError("owner required");
    return actingUser;
  },
  UnauthenticatedError,
  ForbiddenError,
}));

/**
 * Imported only when the suite is going to run. These modules reach
 * `env.ts`, which validates DATABASE_URL and AUTH_SECRET at import time and
 * throws without them — so a plain `npm test` on a machine with no database
 * would fail to even load this file, rather than skipping it.
 *
 * Definite-assignment assertions are safe here for the same reason: nothing
 * below the guard executes unless the imports ran.
 */
let prisma!: (typeof import("@/shared/lib/prisma"))["prisma"];
let vehicleActions!: typeof import("@/modules/fuel/server/vehicle-actions");
let fuelEntryActions!: typeof import("@/modules/fuel/server/fuel-entry-actions");
let accountActions!: typeof import("@/modules/utilities/server/account-actions");
let billActions!: typeof import("@/modules/utilities/server/bill-actions");
let fuelQueries!: typeof import("@/modules/fuel/server/queries");
let utilityQueries!: typeof import("@/modules/utilities/server/queries");

if (DB_TESTS_ENABLED) {
  ({ prisma } = await import("@/shared/lib/prisma"));
  vehicleActions = await import("@/modules/fuel/server/vehicle-actions");
  fuelEntryActions = await import("@/modules/fuel/server/fuel-entry-actions");
  accountActions = await import("@/modules/utilities/server/account-actions");
  billActions = await import("@/modules/utilities/server/bill-actions");
  fuelQueries = await import("@/modules/fuel/server/queries");
  utilityQueries = await import("@/modules/utilities/server/queries");
}

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Ids belonging to household A, which household B's user will reach for. */
interface Fixture {
  ownerA: User;
  ownerB: User;
  householdAId: string;
  householdBId: string;
  vehicleId: string;
  fuelEntryId: string;
  accountId: string;
  billId: string;
}

let f: Fixture;

async function createHousehold(label: string) {
  const household = await prisma.household.create({
    data: { name: `Tenancy ${label}`, currency: "MKD" },
  });
  const owner = await prisma.user.create({
    data: {
      email: `tenancy-${label}-${household.id}@example.test`,
      name: `Owner ${label}`,
      passwordHash: "not-used-in-this-suite",
      role: "OWNER",
      householdId: household.id,
    },
  });
  return { household, owner };
}

describe.skipIf(!DB_TESTS_ENABLED)("household tenancy isolation", () => {
  beforeAll(async () => {
    const a = await createHousehold("A");
    const b = await createHousehold("B");

    const vehicle = await prisma.vehicle.create({
      data: { householdId: a.household.id, name: "A's car", fuelType: "DIESEL", initialOdometer: 1000 },
    });
    const fuelEntry = await prisma.fuelEntry.create({
      data: {
        householdId: a.household.id,
        vehicleId: vehicle.id,
        createdByUserId: a.owner.id,
        date: new Date("2026-08-01T00:00:00.000Z"),
        odometer: 1200,
        fuelPrice: 85.5,
        liters: 40,
        totalPaid: 3420,
        currency: "MKD",
      },
    });
    const account = await prisma.utilityAccount.create({
      data: {
        householdId: a.household.id,
        utilityType: "ELECTRICITY",
        name: "A's meter",
        tracksReadings: false,
      },
    });
    const bill = await prisma.utilityBill.create({
      data: {
        householdId: a.household.id,
        accountId: account.id,
        createdByUserId: a.owner.id,
        periodFrom: new Date("2026-07-01T00:00:00.000Z"),
        periodTo: new Date("2026-07-31T00:00:00.000Z"),
        dueDate: new Date("2026-08-15T00:00:00.000Z"),
        amount: 2500,
        currency: "MKD",
      },
    });

    f = {
      ownerA: a.owner,
      ownerB: b.owner,
      householdAId: a.household.id,
      householdBId: b.household.id,
      vehicleId: vehicle.id,
      fuelEntryId: fuelEntry.id,
      accountId: account.id,
      billId: bill.id,
    };
  });

  afterAll(async () => {
    if (f) {
      // Cascades clear vehicles, entries, accounts and bills.
      await prisma.household.deleteMany({
        where: { id: { in: [f.householdAId, f.householdBId] } },
      });
    }
    await prisma.$disconnect();
  });

  describe("as a member of another household", () => {
    beforeAll(() => {
      actingUser = f.ownerB;
    });

    const validVehicle = { name: "Renamed", fuelType: "PETROL", initialOdometer: "0" };
    const validEntry = {
      date: "2026-08-02",
      odometer: "1500",
      fuelPrice: "85.5",
      liters: "40",
      totalPaid: "3420",
    };
    const validBill = {
      periodFrom: "2026-07-01",
      periodTo: "2026-07-31",
      dueDate: "2026-08-15",
      amount: "9999",
    };

    it.each([
      ["updateVehicle", () => vehicleActions.updateVehicle(f.vehicleId, undefined, formData(validVehicle))],
      ["archiveVehicle", () => vehicleActions.archiveVehicle(f.vehicleId)],
      ["unarchiveVehicle", () => vehicleActions.unarchiveVehicle(f.vehicleId)],
      ["deleteVehicle", () => vehicleActions.deleteVehicle(f.vehicleId)],
      [
        "updateFuelEntry",
        () =>
          fuelEntryActions.updateFuelEntry(
            f.fuelEntryId,
            undefined,
            formData({ ...validEntry, vehicleId: f.vehicleId })
          ),
      ],
      ["deleteFuelEntry", () => fuelEntryActions.deleteFuelEntry(f.fuelEntryId)],
      [
        "createFuelEntry (foreign vehicle)",
        () =>
          fuelEntryActions.createFuelEntry(
            undefined,
            formData({ ...validEntry, vehicleId: f.vehicleId })
          ),
      ],
      [
        "updateUtilityAccount",
        () => accountActions.updateUtilityAccount(f.accountId, undefined, formData({ name: "Renamed" })),
      ],
      ["archiveUtilityAccount", () => accountActions.archiveUtilityAccount(f.accountId)],
      ["unarchiveUtilityAccount", () => accountActions.unarchiveUtilityAccount(f.accountId)],
      ["deleteUtilityAccount", () => accountActions.deleteUtilityAccount(f.accountId)],
      [
        "updateUtilityBill",
        () =>
          billActions.updateUtilityBill(
            f.billId,
            undefined,
            formData({ ...validBill, accountId: f.accountId })
          ),
      ],
      ["deleteUtilityBill", () => billActions.deleteUtilityBill(f.billId)],
      ["toggleBillPaid", () => billActions.toggleBillPaid(f.billId, true)],
      [
        "createUtilityBill (foreign account)",
        () =>
          billActions.createUtilityBill(
            undefined,
            formData({ ...validBill, accountId: f.accountId })
          ),
      ],
    ])("%s refuses to touch another household's row", async (_name, run) => {
      const result = await run();
      expect(result.ok).toBe(false);
      // Specifically the tenancy code — a validation failure would be
      // `validation.required`, and would mean this case proved nothing.
      expect(result.ok === false && result.error).toBe("common.notFound");
    });

    it("leaves the targeted rows untouched after all of the above", async () => {
      const [vehicle, entry, account, bill] = await Promise.all([
        prisma.vehicle.findUnique({ where: { id: f.vehicleId } }),
        prisma.fuelEntry.findUnique({ where: { id: f.fuelEntryId } }),
        prisma.utilityAccount.findUnique({ where: { id: f.accountId } }),
        prisma.utilityBill.findUnique({ where: { id: f.billId } }),
      ]);

      expect(vehicle).not.toBeNull();
      expect(vehicle!.name).toBe("A's car");
      expect(vehicle!.archivedAt).toBeNull();

      expect(entry).not.toBeNull();
      expect(entry!.odometer).toBe(1200);

      expect(account).not.toBeNull();
      expect(account!.name).toBe("A's meter");

      expect(bill).not.toBeNull();
      expect(Number(bill!.amount)).toBe(2500);
      expect(bill!.paymentDate).toBeNull();
    });

    it("creates nothing in the other household", async () => {
      const [entries, bills] = await Promise.all([
        prisma.fuelEntry.count({ where: { householdId: f.householdBId } }),
        prisma.utilityBill.count({ where: { householdId: f.householdBId } }),
      ]);
      expect(entries).toBe(0);
      expect(bills).toBe(0);
    });

    it("reads return nothing for another household's ids", async () => {
      await expect(fuelQueries.getVehicle(f.vehicleId)).resolves.toBeNull();
      await expect(fuelQueries.getFuelEntry(f.fuelEntryId)).resolves.toBeNull();
      await expect(utilityQueries.getUtilityAccount(f.accountId)).resolves.toBeNull();
      await expect(utilityQueries.getUtilityBill(f.billId)).resolves.toBeNull();
    });

    it("list queries never leak another household's rows", async () => {
      const [vehicles, accounts, entries, bills] = await Promise.all([
        fuelQueries.getVehicles({ includeArchived: true }),
        utilityQueries.getUtilityAccounts({ includeArchived: true }),
        fuelQueries.getFuelEntriesForVehicle(f.vehicleId),
        utilityQueries.getUtilityBillsForAccount(f.accountId),
      ]);
      expect(vehicles).toHaveLength(0);
      expect(accounts).toHaveLength(0);
      // Scoped by householdId as well as by the foreign parent id, so even a
      // known vehicle/account id yields nothing.
      expect(entries).toHaveLength(0);
      expect(bills).toHaveLength(0);
    });
  });

  describe("as the owning household (positive control)", () => {
    beforeAll(() => {
      actingUser = f.ownerA;
    });

    it("can read its own records", async () => {
      await expect(fuelQueries.getVehicle(f.vehicleId)).resolves.not.toBeNull();
      await expect(utilityQueries.getUtilityAccount(f.accountId)).resolves.not.toBeNull();
    });

    /**
     * Proves the fixture payloads above are actually valid. Without this, a
     * typo in `validVehicle` would make every rejection case pass for the
     * wrong reason.
     */
    it("can update its own vehicle with the same payload household B was refused", async () => {
      const result = await vehicleActions.updateVehicle(
        f.vehicleId,
        undefined,
        formData({ name: "Renamed", fuelType: "PETROL", initialOdometer: "0" })
      );
      expect(result.ok).toBe(true);

      const vehicle = await prisma.vehicle.findUnique({ where: { id: f.vehicleId } });
      expect(vehicle!.name).toBe("Renamed");
    });
  });
});
