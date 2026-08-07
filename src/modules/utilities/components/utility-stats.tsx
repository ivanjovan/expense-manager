import { getTranslations } from "next-intl/server";
import { formatMoney, formatNumber, type SupportedCurrency } from "@/shared/lib/money";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { getUtilityAccountStats } from "@/modules/utilities/server/queries";

type AccountStatsResult = Awaited<ReturnType<typeof getUtilityAccountStats>>;

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

export async function UtilityStats({
  stats,
  currency,
  locale,
}: {
  stats: AccountStatsResult;
  currency: SupportedCurrency;
  locale: string;
}) {
  const t = await getTranslations("utilities.stats");

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <StatCard label={t("currentMonthTotal")} value={formatMoney(stats.currentMonthTotal, currency, locale)} />
      <StatCard label={t("currentYearTotal")} value={formatMoney(stats.currentYearTotal, currency, locale)} />
      <StatCard label={t("totalUnpaid")} value={formatMoney(stats.totalUnpaid, currency, locale)} />
      <StatCard
        label={t("nextPaymentDue")}
        value={
          stats.nextPaymentDue
            ? new Intl.DateTimeFormat(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(stats.nextPaymentDue.dueDate)
            : t("noPaymentDue")
        }
      />
      <StatCard label={t("averageMonthlyBill")} value={stats.averageMonthlyBill !== null ? formatMoney(stats.averageMonthlyBill, currency, locale) : "—"} />
      <StatCard label={t("highestBill")} value={stats.highestBill !== null ? formatMoney(stats.highestBill, currency, locale) : "—"} />
      <StatCard label={t("lowestBill")} value={stats.lowestBill !== null ? formatMoney(stats.lowestBill, currency, locale) : "—"} />
      {stats.overdueCount > 0 && (
        <StatCard
          label={t("overdueCount")}
          value={`${stats.overdueCount} (${formatMoney(stats.overdueValue, currency, locale)})`}
        />
      )}
      {stats.totalKwh > 0 && (
        <>
          <StatCard label={t("totalKwh")} value={`${formatNumber(stats.totalKwh, locale, { maximumFractionDigits: 1 })} kWh`} />
          <StatCard
            label={t("averagePricePerUnit")}
            value={stats.averagePricePerUnit !== null ? formatMoney(stats.averagePricePerUnit, currency, locale) : "—"}
          />
        </>
      )}
    </div>
  );
}
