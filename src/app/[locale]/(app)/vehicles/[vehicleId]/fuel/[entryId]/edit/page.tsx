import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { FuelEntryForm } from "@/modules/fuel/components/fuel-entry-form";
import { getVehicle, getFuelEntry } from "@/modules/fuel/server/queries";
import { getHousehold } from "@/modules/household/server/queries";

export default async function EditFuelEntryPage({
  params,
}: {
  params: Promise<{ vehicleId: string; entryId: string }>;
}) {
  const { vehicleId, entryId } = await params;
  const [t, vehicle, entry, household] = await Promise.all([
    getTranslations("fuel.entry"),
    getVehicle(vehicleId),
    getFuelEntry(entryId),
    getHousehold(),
  ]);

  if (!vehicle || !entry || entry.vehicleId !== vehicleId) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("editTitle")} — {vehicle.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FuelEntryForm
            mode="edit"
            vehicleId={vehicleId}
            entryId={entry.id}
            householdCurrency={household.currency}
            defaultValues={{
              date: entry.date.toISOString().slice(0, 10),
              odometer: entry.odometer,
              fuelPrice: Number(entry.fuelPrice),
              liters: Number(entry.liters),
              totalPaid: Number(entry.totalPaid),
              derivedField: entry.derivedField,
              isFullTank: entry.isFullTank,
              missedEntries: entry.missedEntries,
              station: entry.station,
              notes: entry.notes,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
