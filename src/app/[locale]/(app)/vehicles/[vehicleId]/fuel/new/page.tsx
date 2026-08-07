import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { FuelEntryForm } from "@/modules/fuel/components/fuel-entry-form";
import { getVehicle } from "@/modules/fuel/server/queries";

export default async function NewFuelEntryPage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const [t, vehicle] = await Promise.all([
    getTranslations("fuel.entry"),
    getVehicle(vehicleId),
  ]);

  if (!vehicle) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("addTitle")} — {vehicle.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FuelEntryForm mode="create" vehicleId={vehicleId} />
        </CardContent>
      </Card>
    </div>
  );
}
