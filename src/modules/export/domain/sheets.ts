/**
 * Domain data -> sheet models. Pure: no Prisma, no ExcelJS, no I/O.
 *
 * Inputs are structural rather than Prisma types so the shaping can be
 * tested with plain objects, and so a query changing its `include` shape
 * doesn't ripple in here (the same reason getHouseholdFuelSummary uses
 * FuelEntryLike).
 */

import type { ColumnModel, SheetModel } from "./workbook-model";
import { toNumber } from "./workbook-model";
import { computeConsumption, type ConsumptionEntry } from "@/modules/fuel/domain/consumption";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Every user-facing string in an export (§13: none may be hardcoded). */
export interface ExportLabels {
  sheets: {
    vehicles: string;
    fuelEntries: string;
    utilityAccounts: string;
    utilityBills: string;
    meterReadings: string;
  };
  columns: Record<string, string>;
  values: {
    yes: string;
    no: string;
    manual: string;
    ocr: string;
    paid: string;
    unpaid: string;
  };
  /** Enum -> localized label; falls back to the raw code if absent. */
  fuelTypes: Record<string, string>;
  utilityTypes: Record<string, string>;
  units: Record<string, string>;
  bands: Record<string, string>;
}

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

function bool(value: boolean, labels: ExportLabels): string {
  return value ? labels.values.yes : labels.values.no;
}

function columns(labels: ExportLabels, defs: [key: string, type: ColumnModel["type"], width?: number][]): ColumnModel[] {
  return defs.map(([key, type, width]) => ({
    key,
    header: label(labels.columns, key),
    type,
    width,
  }));
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface VehicleRow {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  licensePlate: string | null;
  fuelType: string;
  initialOdometer: number;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface FuelEntryRow {
  id: string;
  vehicleId: string;
  date: Date;
  odometer: number;
  fuelPrice: unknown;
  liters: unknown;
  totalPaid: unknown;
  currency: string;
  isFullTank: boolean;
  missedEntries: boolean;
  inputMethod: string;
  station: string | null;
  notes: string | null;
  createdAt: Date;
  createdBy?: { name: string | null } | null;
}

export interface UtilityAccountRow {
  id: string;
  name: string;
  utilityType: string;
  provider: string | null;
  accountNumber: string | null;
  meterNumber: string | null;
  tracksReadings: boolean;
  unit: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface UtilityBillRow {
  id: string;
  accountId: string;
  periodFrom: Date;
  periodTo: Date;
  issueDate: Date | null;
  dueDate: Date;
  amount: unknown;
  taxAmount: unknown;
  previousDebt: unknown;
  currency: string;
  paymentDate: Date | null;
  invoiceNumber: string | null;
  notes: string | null;
  inputMethod: string;
  createdAt: Date;
  createdBy?: { name: string | null } | null;
  readings?: {
    band: string;
    previousReading: unknown;
    currentReading: unknown;
    consumption: unknown;
    unit: string;
    meterRollover: boolean;
  }[];
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

export function buildVehiclesSheet(vehicles: VehicleRow[], labels: ExportLabels): SheetModel {
  return {
    name: labels.sheets.vehicles,
    columns: columns(labels, [
      ["name", "text", 22],
      ["manufacturer", "text", 16],
      ["model", "text", 16],
      ["licensePlate", "text", 14],
      ["fuelType", "text", 12],
      ["initialOdometer", "number", 16],
      ["notes", "text", 30],
      ["archived", "text", 10],
      ["createdAt", "date", 12],
    ]),
    rows: vehicles.map((v) => ({
      name: v.name,
      manufacturer: v.manufacturer,
      model: v.model,
      licensePlate: v.licensePlate,
      fuelType: label(labels.fuelTypes, v.fuelType),
      initialOdometer: v.initialOdometer,
      notes: v.notes,
      archived: bool(v.archivedAt !== null, labels),
      createdAt: v.createdAt,
    })),
  };
}

/**
 * Fuel entries, with the derived consumption figures joined on.
 *
 * A segment's L/100km belongs to the entry that *closes* it — the fill-up
 * that proves how much fuel the preceding distance consumed. Entries that
 * don't close a valid segment (first ever, a partial fill, a gap the user
 * flagged) get blank cells rather than a zero, because "not measurable
 * here" and "used no fuel" must not look the same in a spreadsheet someone
 * will later sum.
 *
 * Consumption is computed per vehicle: the engine walks a single vehicle's
 * odometer chain, and pooling two cars' entries would invent segments that
 * span both.
 */
export function buildFuelEntriesSheet(
  entries: FuelEntryRow[],
  vehicles: VehicleRow[],
  labels: ExportLabels
): SheetModel {
  const vehicleNames = new Map(vehicles.map((v) => [v.id, v.name]));

  const segmentByEndEntry = new Map<string, { distanceKm: number; consumptionL100km: number; costPerKm: number }>();
  for (const vehicle of vehicles) {
    const forVehicle = entries.filter((e) => e.vehicleId === vehicle.id);
    if (forVehicle.length === 0) continue;
    const consumptionEntries: ConsumptionEntry[] = forVehicle.map((e) => ({
      id: e.id,
      date: e.date,
      odometer: e.odometer,
      liters: toNumber(e.liters) ?? 0,
      totalPaid: toNumber(e.totalPaid) ?? 0,
      isFullTank: e.isFullTank,
      missedEntries: e.missedEntries,
      createdAt: e.createdAt,
    }));
    for (const s of computeConsumption(consumptionEntries).segments) {
      segmentByEndEntry.set(s.endEntryId, {
        distanceKm: s.distanceKm,
        consumptionL100km: s.consumptionL100km,
        costPerKm: s.costPerKm,
      });
    }
  }

  const sorted = [...entries].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.odometer - b.odometer
  );

  return {
    name: labels.sheets.fuelEntries,
    columns: columns(labels, [
      ["date", "date", 12],
      ["vehicle", "text", 20],
      ["odometer", "number", 12],
      ["liters", "decimal", 10],
      ["fuelPrice", "money", 14],
      ["totalPaid", "money", 14],
      ["distanceKm", "number", 12],
      ["consumptionL100km", "decimal", 16],
      ["costPerKm", "decimal", 14],
      ["isFullTank", "text", 11],
      ["missedEntries", "text", 14],
      ["station", "text", 20],
      ["notes", "text", 28],
      ["inputMethod", "text", 12],
      ["addedBy", "text", 16],
    ]),
    rows: sorted.map((e) => {
      const segment = segmentByEndEntry.get(e.id);
      return {
        date: e.date,
        vehicle: vehicleNames.get(e.vehicleId) ?? "",
        odometer: e.odometer,
        liters: toNumber(e.liters),
        fuelPrice: toNumber(e.fuelPrice),
        totalPaid: toNumber(e.totalPaid),
        distanceKm: segment?.distanceKm ?? null,
        consumptionL100km: segment?.consumptionL100km ?? null,
        costPerKm: segment?.costPerKm ?? null,
        isFullTank: bool(e.isFullTank, labels),
        missedEntries: bool(e.missedEntries, labels),
        station: e.station,
        notes: e.notes,
        inputMethod: e.inputMethod === "OCR" ? labels.values.ocr : labels.values.manual,
        addedBy: e.createdBy?.name ?? null,
      };
    }),
  };
}

export function buildUtilityAccountsSheet(
  accounts: UtilityAccountRow[],
  labels: ExportLabels
): SheetModel {
  return {
    name: labels.sheets.utilityAccounts,
    columns: columns(labels, [
      ["name", "text", 22],
      ["utilityType", "text", 14],
      ["provider", "text", 18],
      ["accountNumber", "text", 18],
      ["meterNumber", "text", 16],
      ["tracksReadings", "text", 14],
      ["unit", "text", 8],
      ["archived", "text", 10],
      ["createdAt", "date", 12],
    ]),
    rows: accounts.map((a) => ({
      name: a.name,
      utilityType: label(labels.utilityTypes, a.utilityType),
      provider: a.provider,
      accountNumber: a.accountNumber,
      meterNumber: a.meterNumber,
      tracksReadings: bool(a.tracksReadings, labels),
      unit: a.unit ? label(labels.units, a.unit) : null,
      archived: bool(a.archivedAt !== null, labels),
      createdAt: a.createdAt,
    })),
  };
}

export function buildUtilityBillsSheet(
  bills: UtilityBillRow[],
  accounts: UtilityAccountRow[],
  labels: ExportLabels
): SheetModel {
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const sorted = [...bills].sort((a, b) => a.periodFrom.getTime() - b.periodFrom.getTime());

  return {
    name: labels.sheets.utilityBills,
    columns: columns(labels, [
      ["account", "text", 20],
      ["periodFrom", "date", 12],
      ["periodTo", "date", 12],
      ["issueDate", "date", 12],
      ["dueDate", "date", 12],
      ["amount", "money", 14],
      ["taxAmount", "money", 14],
      ["previousDebt", "money", 16],
      ["totalDue", "money", 14],
      ["paymentStatus", "text", 10],
      ["paymentDate", "date", 12],
      ["invoiceNumber", "text", 18],
      ["notes", "text", 28],
      ["inputMethod", "text", 12],
      ["addedBy", "text", 16],
    ]),
    rows: sorted.map((b) => ({
      account: accountNames.get(b.accountId) ?? "",
      periodFrom: b.periodFrom,
      periodTo: b.periodTo,
      issueDate: b.issueDate,
      dueDate: b.dueDate,
      amount: toNumber(b.amount),
      taxAmount: toNumber(b.taxAmount),
      previousDebt: toNumber(b.previousDebt),
      // Derived here rather than stored, same as in the form: it is
      // amount + previousDebt by definition. Blank when there is no debt,
      // so a column of totals is not silently duplicating `amount`.
      totalDue:
        toNumber(b.previousDebt) === null
          ? null
          : (toNumber(b.amount) ?? 0) + (toNumber(b.previousDebt) ?? 0),
      // Deliberately only paid/unpaid: "overdue" is relative to the moment
      // the file is opened, and a spreadsheet has no way to stay current.
      paymentStatus: b.paymentDate ? labels.values.paid : labels.values.unpaid,
      paymentDate: b.paymentDate,
      invoiceNumber: b.invoiceNumber,
      notes: b.notes,
      inputMethod: b.inputMethod === "OCR" ? labels.values.ocr : labels.values.manual,
      addedBy: b.createdBy?.name ?? null,
    })),
  };
}

/**
 * Readings get their own sheet rather than extra columns on the bills sheet.
 * A dual-tariff bill has two of them, and flattening HIGH/LOW into one row
 * hardcodes "exactly two bands" into the file format — which breaks the
 * moment a single-tariff water account is exported alongside.
 */
export function buildMeterReadingsSheet(
  bills: UtilityBillRow[],
  accounts: UtilityAccountRow[],
  labels: ExportLabels
): SheetModel {
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const sorted = [...bills].sort((a, b) => a.periodFrom.getTime() - b.periodFrom.getTime());

  const rows = sorted.flatMap((b) =>
    (b.readings ?? []).map((r) => ({
      account: accountNames.get(b.accountId) ?? "",
      periodFrom: b.periodFrom,
      periodTo: b.periodTo,
      band: label(labels.bands, r.band),
      previousReading: toNumber(r.previousReading),
      currentReading: toNumber(r.currentReading),
      consumption: toNumber(r.consumption),
      unit: label(labels.units, r.unit),
      meterRollover: bool(r.meterRollover, labels),
    }))
  );

  return {
    name: labels.sheets.meterReadings,
    columns: columns(labels, [
      ["account", "text", 20],
      ["periodFrom", "date", 12],
      ["periodTo", "date", 12],
      ["band", "text", 12],
      ["previousReading", "decimal", 16],
      ["currentReading", "decimal", 16],
      ["consumption", "decimal", 14],
      ["unit", "text", 8],
      ["meterRollover", "text", 12],
    ]),
    rows,
  };
}
