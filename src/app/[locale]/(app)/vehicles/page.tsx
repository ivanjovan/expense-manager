import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/components/ui/card";
import { getVehicles } from "@/modules/fuel/server/queries";
import { VehicleListActions } from "@/modules/fuel/components/vehicle-list-actions";

export async function generateMetadata() {
  const t = await getTranslations("fuel.vehicles");
  return { title: t("title") };
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "true";
  const [t, vehicles] = await Promise.all([
    getTranslations("fuel.vehicles"),
    getVehicles({ includeArchived: showArchived }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={showArchived ? "/vehicles" : { pathname: "/vehicles", query: { archived: "true" } }}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("showArchived")}
          </Link>
          <Link href="/vehicles/new" className={buttonVariants()}>
            {t("addButton")}
          </Link>
        </div>
      </div>

      {vehicles.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center py-16">
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription className="max-w-sm">{t("emptyBody")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className={vehicle.archivedAt ? "opacity-60" : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>
                      <Link href={`/vehicles/${vehicle.id}`} className="hover:underline">
                        {vehicle.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {[vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ") || "—"}
                    </CardDescription>
                  </div>
                  {vehicle.archivedAt && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t("archived")}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t(`fuelTypes.${vehicle.fuelType}`)}
                  {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                </span>
                <VehicleListActions
                  vehicleId={vehicle.id}
                  vehicleName={vehicle.name}
                  archived={Boolean(vehicle.archivedAt)}
                  hasEntries={vehicle._count.fuelEntries > 0}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
