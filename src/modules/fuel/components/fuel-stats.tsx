import { getTranslations } from "next-intl/server";
import { formatMoney, formatNumber, type SupportedCurrency } from "@/shared/lib/money";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { getVehicleStats } from "@/modules/fuel/server/queries";

type VehicleStatsResult = Awaited<ReturnType<typeof getVehicleStats>>;

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

export async function FuelStats({
  stats,
  currency,
  locale,
}: {
  stats: VehicleStatsResult;
  currency: SupportedCurrency;
  locale: string;
}) {
  const t = await getTranslations("fuel.stats");
  const { consumption } = stats;
  const hasConsumption = consumption.averageConsumptionL100km !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label={t("totalSpent")} value={formatMoney(stats.totalSpent, currency, locale)} />
        <StatCard
          label={t("totalLiters")}
          value={formatNumber(stats.totalLiters, locale, { maximumFractionDigits: 1 })}
        />
        <StatCard
          label={t("averageFuelPrice")}
          value={
            stats.averageFuelPrice !== null
              ? formatMoney(stats.averageFuelPrice, currency, locale)
              : "—"
          }
        />
        {hasConsumption && (
          <>
            <StatCard
              label={t("averageConsumption")}
              value={`${formatNumber(consumption.averageConsumptionL100km!, locale, {
                maximumFractionDigits: 2,
              })} L/100km`}
            />
            <StatCard
              label={t("costPerKm")}
              value={formatMoney(consumption.averageCostPerKm!, currency, locale)}
            />
            <StatCard
              label={t("costPer100km")}
              value={formatMoney(consumption.averageCostPerKm! * 100, currency, locale)}
            />
            <StatCard
              label={t("totalDistance")}
              value={`${formatNumber(consumption.totalDistanceKm, locale)} km`}
            />
          </>
        )}
      </div>

      {hasConsumption ? (
        <p className="text-xs text-muted-foreground">
          {t("basedOnEntries", {
            count: consumption.includedEntryCount,
            total: consumption.totalEntryCount,
          })}
        </p>
      ) : (
        stats.entryCount > 0 && (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              <p>{t("insufficientData")}</p>
              <p className="mt-1 text-xs">{t("insufficientDataHint")}</p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
