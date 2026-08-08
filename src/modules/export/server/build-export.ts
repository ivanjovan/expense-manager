import "server-only";
import { getTranslations } from "next-intl/server";
import type { ExportLabels } from "../domain/sheets";
import {
  buildFuelEntriesSheet,
  buildMeterReadingsSheet,
  buildUtilityAccountsSheet,
  buildUtilityBillsSheet,
  buildVehiclesSheet,
} from "../domain/sheets";
import type { SheetModel, WorkbookModel } from "../domain/workbook-model";
import { safeFilenameSegment } from "../domain/workbook-model";
import { getAccountExport, getFullHouseholdExport, getVehicleExport } from "./export-data";
import { resolveLocale } from "@/i18n/resolve-locale";
import type { AppLocale } from "@/i18n/routing";
import type { ExportScope } from "./export-data";

/**
 * Assembles a WorkbookModel for a scope: reads the data, resolves the
 * labels in the caller's locale (§13), and drops sheets that would be
 * empty — a workbook of five blank tabs is worse than one populated one.
 */

async function loadLabels(locale: AppLocale): Promise<ExportLabels> {
  // Passing `locale` explicitly is load-bearing. next-intl reads the locale
  // from the `/[locale]/` path prefix, and this runs under /api where there
  // isn't one — without it every export silently came out in English.
  const [t, tFuel, tUtil] = await Promise.all([
    getTranslations({ locale, namespace: "export" }),
    getTranslations({ locale, namespace: "fuel.vehicles" }),
    getTranslations({ locale, namespace: "utilities" }),
  ]);

  const columnKeys = [
    "name", "manufacturer", "model", "licensePlate", "fuelType", "initialOdometer",
    "notes", "archived", "createdAt", "date", "vehicle", "odometer", "liters",
    "fuelPrice", "totalPaid", "distanceKm", "consumptionL100km", "costPerKm",
    "isFullTank", "missedEntries", "station", "inputMethod", "addedBy",
    "utilityType", "provider", "accountNumber", "meterNumber", "tracksReadings",
    "unit", "account", "periodFrom", "periodTo", "issueDate", "dueDate", "amount",
    "paymentStatus", "paymentDate", "invoiceNumber", "band", "previousReading",
    "currentReading", "consumption", "meterRollover",
  ] as const;

  return {
    sheets: {
      vehicles: t("sheets.vehicles"),
      fuelEntries: t("sheets.fuelEntries"),
      utilityAccounts: t("sheets.utilityAccounts"),
      utilityBills: t("sheets.utilityBills"),
      meterReadings: t("sheets.meterReadings"),
    },
    columns: Object.fromEntries(
      columnKeys.map((key) => [key, t(`columns.${key}`)])
    ),
    values: {
      yes: t("values.yes"),
      no: t("values.no"),
      manual: t("values.manual"),
      ocr: t("values.ocr"),
      paid: tUtil("status.PAID"),
      unpaid: tUtil("status.UNPAID"),
    },
    fuelTypes: {
      PETROL: tFuel("fuelTypes.PETROL"),
      DIESEL: tFuel("fuelTypes.DIESEL"),
      LPG: tFuel("fuelTypes.LPG"),
      CNG: tFuel("fuelTypes.CNG"),
      ELECTRIC: tFuel("fuelTypes.ELECTRIC"),
      HYBRID: tFuel("fuelTypes.HYBRID"),
    },
    utilityTypes: {
      ELECTRICITY: t("utilityTypes.ELECTRICITY"),
      WATER: t("utilityTypes.WATER"),
      GAS: t("utilityTypes.GAS"),
      INTERNET: t("utilityTypes.INTERNET"),
      MOBILE: t("utilityTypes.MOBILE"),
    },
    units: { KWH: t("units.KWH"), M3: t("units.M3") },
    bands: { SINGLE: t("bands.SINGLE"), HIGH: t("bands.HIGH"), LOW: t("bands.LOW") },
  };
}

export interface BuiltExport {
  model: WorkbookModel;
  currency: "MKD" | "EUR";
}

/** Returns null when the scoped vehicle or account doesn't exist in this
 * household — the route turns that into a 404 rather than an empty file. */
export async function buildExport(
  scope: ExportScope,
  requestedLocale?: string | null
): Promise<BuiltExport | null> {
  const data =
    scope.kind === "household"
      ? await getFullHouseholdExport()
      : scope.kind === "vehicle"
        ? await getVehicleExport(scope.id)
        : await getAccountExport(scope.id);

  if (!data) return null;

  const labels = await loadLabels(resolveLocale(requestedLocale, data.viewerLocale));
  const currency = data.household.currency as "MKD" | "EUR";

  const candidates: SheetModel[] = [
    buildVehiclesSheet(data.vehicles, labels),
    buildFuelEntriesSheet(data.fuelEntries, data.vehicles, labels),
    buildUtilityAccountsSheet(data.accounts, labels),
    buildUtilityBillsSheet(data.bills, data.accounts, labels),
    buildMeterReadingsSheet(data.bills, data.accounts, labels),
  ];
  const sheets = candidates.filter((sheet) => sheet.rows.length > 0);

  const scopeName =
    scope.kind === "vehicle"
      ? data.vehicles[0]?.name
      : scope.kind === "account"
        ? data.accounts[0]?.name
        : data.household.name;

  const stamp = new Date().toISOString().slice(0, 10);

  return {
    model: {
      filename: `${safeFilenameSegment(scopeName ?? "export")}-${stamp}`,
      // An export with nothing in it still has to be a valid file the user
      // can open, so fall back to the empty vehicles sheet rather than none.
      sheets: sheets.length > 0 ? sheets : [candidates[0]],
    },
    currency,
  };
}
