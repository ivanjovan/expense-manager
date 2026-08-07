import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { VehicleForm } from "@/modules/fuel/components/vehicle-form";
import { getVehicle } from "@/modules/fuel/server/queries";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const [t, vehicle] = await Promise.all([
    getTranslations("fuel.vehicles"),
    getVehicle(vehicleId),
  ]);

  if (!vehicle) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <VehicleForm
            mode="edit"
            vehicleId={vehicle.id}
            defaultValues={{
              name: vehicle.name,
              manufacturer: vehicle.manufacturer,
              model: vehicle.model,
              fuelType: vehicle.fuelType,
              licensePlate: vehicle.licensePlate,
              initialOdometer: vehicle.initialOdometer,
              notes: vehicle.notes,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
