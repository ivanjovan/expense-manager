import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/components/ui/card";
import { getUtilityAccount, getUtilityAccountStats } from "@/modules/utilities/server/queries";
import { getHousehold } from "@/modules/household/server/queries";
import { ExportButton } from "@/modules/export/components/export-button";
import { UtilityStats } from "@/modules/utilities/components/utility-stats";
import { BillsTable, type UtilityBillRow } from "@/modules/utilities/components/bills-table";
import {
  MonthlyExpensesChart,
  YearlyExpensesChart,
  KwhConsumptionChart,
  PaidVsUnpaidChart,
  HighLowSplitChart,
} from "@/modules/utilities/components/utility-charts";
import { groupBillsByMonth, groupBillsByYear } from "@/modules/utilities/domain/billing-period";

function billKwh(bill: { readings: { band: string; consumption: unknown }[] }): number {
  return bill.readings.reduce((sum, r) => sum + Number(r.consumption), 0);
}

export default async function UtilityAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [t, tb, locale, account, stats, household] = await Promise.all([
    getTranslations("utilities.account"),
    getTranslations("utilities.bill"),
    getLocale(),
    getUtilityAccount(accountId),
    getUtilityAccountStats(accountId),
    getHousehold(),
  ]);

  if (!account) notFound();

  const currency = household.currency;

  const tableRows: UtilityBillRow[] = stats.bills
    .slice()
    .reverse() // chronological asc -> newest first for the table's default view
    .map((b) => ({
      id: b.id,
      accountId: b.accountId,
      periodFrom: b.periodFrom.toISOString(),
      periodTo: b.periodTo.toISOString(),
      dueDate: b.dueDate.toISOString(),
      paymentDate: b.paymentDate ? b.paymentDate.toISOString() : null,
      amount: Number(b.amount),
      currency: b.currency,
      invoiceNumber: b.invoiceNumber,
      notes: b.notes,
      kwh: billKwh(b),
    }));

  const monthly = groupBillsByMonth(
    stats.bills.map((b) => ({ periodFrom: b.periodFrom, amount: Number(b.amount), kwh: billKwh(b) }))
  );
  const yearly = groupBillsByYear(
    stats.bills.map((b) => ({ periodFrom: b.periodFrom, amount: Number(b.amount), kwh: billKwh(b) }))
  );

  let totalHigh = 0;
  let totalLow = 0;
  for (const bill of stats.bills) {
    for (const reading of bill.readings) {
      if (reading.band === "HIGH") totalHigh += Number(reading.consumption);
      if (reading.band === "LOW") totalLow += Number(reading.consumption);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
          <p className="text-sm text-muted-foreground">
            {account.provider || "—"}
            {account.meterNumber ? ` · ${t("meterNumber")}: ${account.meterNumber}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton scope="account" id={accountId} labelKey="accountButton" />
          <Link href={`/utilities/${accountId}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {tb("editButton")}
          </Link>
          <Link href={`/utilities/${accountId}/bills/new`} className={buttonVariants({ size: "sm" })}>
            {tb("addButton")}
          </Link>
        </div>
      </div>

      <UtilityStats stats={stats} currency={currency} locale={locale} />

      {stats.bills.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <MonthlyExpensesChart points={monthly.map(({ month, amount }) => ({ month, amount }))} currency={currency} />
          <YearlyExpensesChart points={yearly.map(({ year, amount }) => ({ year, amount }))} currency={currency} />
          <PaidVsUnpaidChart paid={stats.totalPaid} unpaid={stats.totalUnpaid} currency={currency} />
          {account.tracksReadings && (
            <>
              <KwhConsumptionChart points={monthly.map(({ month, kwh }) => ({ month, kwh }))} />
              <HighLowSplitChart high={totalHigh} low={totalLow} />
            </>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tb("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="font-medium">{tb("emptyTitle")}</p>
              <CardDescription>{tb("emptyBody")}</CardDescription>
              <Link href={`/utilities/${accountId}/bills/new`} className={buttonVariants({ size: "sm" })}>
                {tb("addButton")}
              </Link>
            </div>
          ) : (
            <BillsTable bills={tableRows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
