import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/components/ui/card";
import { getVehicle, getVehicleStats } from "@/modules/fuel/server/queries";
import { getHousehold } from "@/modules/household/server/queries";
import { ExportButton } from "@/modules/export/components/export-button";
import { FuelStats } from "@/modules/fuel/components/fuel-stats";
import { FuelEntriesTable, type FuelEntryRow } from "@/modules/fuel/components/fuel-entries-table";
import {
  FuelPriceHistoryChart,
  MonthlySpendingChart,
  MonthlyLitersChart,
  ConsumptionTrendChart,
} from "@/modules/fuel/components/fuel-charts";
import { groupMonthly } from "@/modules/fuel/domain/monthly";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const [tv, locale, vehicle, stats, household] = await Promise.all([
    getTranslations("fuel.entry"),
    getLocale(),
    getVehicle(vehicleId),
    getVehicleStats(vehicleId),
    getHousehold(),
  ]);

  if (!vehicle) notFound();

  const currency = household.currency;

  const tableRows: FuelEntryRow[] = stats.entries
    .slice()
    .reverse() // chronological asc -> newest first for the table's default view
    .map((e) => ({
      id: e.id,
      vehicleId: e.vehicleId,
      date: e.date.toISOString(),
      odometer: e.odometer,
      fuelPrice: Number(e.fuelPrice),
      liters: Number(e.liters),
      totalPaid: Number(e.totalPaid),
      currency: e.currency,
      isFullTank: e.isFullTank,
      missedEntries: e.missedEntries,
      station: e.station,
      notes: e.notes,
      createdByName: e.createdBy.name,
    }));

  const pricePoints = stats.entries.map((e) => ({
    date: e.date.toISOString(),
    fuelPrice: Number(e.fuelPrice),
  }));

  const monthly = groupMonthly(
    stats.entries.map((e) => ({
      date: e.date,
      liters: Number(e.liters),
      totalPaid: Number(e.totalPaid),
    }))
  );

  const consumptionPoints = stats.consumption.segments.map((s) => ({
    date: s.endDate.toISOString(),
    consumptionL100km: s.consumptionL100km,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{vehicle.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ") || "—"}
            {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton scope="vehicle" id={vehicleId} labelKey="vehicleButton" />
          <Link href={`/vehicles/${vehicleId}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {tv("editButton")}
          </Link>
          <Link href={`/vehicles/${vehicleId}/fuel/new`} className={buttonVariants({ size: "sm" })}>
            {tv("addButton")}
          </Link>
        </div>
      </div>

      <FuelStats stats={stats} currency={currency} locale={locale} />

      {stats.entries.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <FuelPriceHistoryChart points={pricePoints} currency={currency} />
          <ConsumptionTrendChart points={consumptionPoints} />
          <MonthlySpendingChart points={monthly} currency={currency} />
          <MonthlyLitersChart points={monthly} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tv("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="font-medium">{tv("emptyTitle")}</p>
              <CardDescription>{tv("emptyBody")}</CardDescription>
              <Link href={`/vehicles/${vehicleId}/fuel/new`} className={buttonVariants({ size: "sm" })}>
                {tv("addButton")}
              </Link>
            </div>
          ) : (
            <FuelEntriesTable entries={tableRows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
