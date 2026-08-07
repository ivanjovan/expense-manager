import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { VehicleForm } from "@/modules/fuel/components/vehicle-form";

export async function generateMetadata() {
  const t = await getTranslations("fuel.vehicles");
  return { title: t("addTitle") };
}

export default async function NewVehiclePage() {
  const t = await getTranslations("fuel.vehicles");

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <VehicleForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
