import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/components/ui/card";
import { getHouseholdFuelSummary } from "@/modules/fuel/server/queries";
import { getHousehold } from "@/modules/household/server/queries";
import { formatMoney, formatNumber } from "@/shared/lib/money";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [t, tf, locale, fuelSummary, household] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("fuel.stats"),
    getLocale(),
    getHouseholdFuelSummary(),
    getHousehold(),
  ]);

  const hasAnyData = fuelSummary.hasVehicles;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {!hasAnyData ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center py-16">
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription className="max-w-sm">{t("emptyBody")}</CardDescription>
            <Link href="/vehicles/new" className={buttonVariants({ size: "sm" }) + " mt-2"}>
              {t("addVehicleCta")}
            </Link>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">{t("vehiclesTitle")}</h2>
            <Link href="/vehicles" className="text-sm text-primary underline-offset-4 hover:underline">
              {t("vehiclesTitle")}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label={tf("totalSpent")} value={formatMoney(fuelSummary.totalSpent, household.currency, locale)} />
            <StatCard
              label={tf("totalLiters")}
              value={formatNumber(fuelSummary.totalLiters, locale, { maximumFractionDigits: 1 })}
            />
            <StatCard
              label={tf("averageFuelPrice")}
              value={
                fuelSummary.averageFuelPrice !== null
                  ? formatMoney(fuelSummary.averageFuelPrice, household.currency, locale)
                  : "—"
              }
            />
            {fuelSummary.averageConsumptionL100km !== null ? (
              <>
                <StatCard
                  label={tf("averageConsumption")}
                  value={`${formatNumber(fuelSummary.averageConsumptionL100km, locale, {
                    maximumFractionDigits: 2,
                  })} L/100km`}
                />
                <StatCard
                  label={tf("costPerKm")}
                  value={formatMoney(fuelSummary.averageCostPerKm!, household.currency, locale)}
                />
              </>
            ) : (
              <Card className="col-span-2 border-dashed">
                <CardContent className="flex h-full items-center py-6 text-center text-xs text-muted-foreground">
                  {tf("insufficientData")}
                </CardContent>
              </Card>
            )}
            {fuelSummary.lastEntry && (
              <StatCard
                label={tf("lastRefuel")}
                value={new Intl.DateTimeFormat(locale, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(fuelSummary.lastEntry.date)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
