import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { BillForm } from "@/modules/utilities/components/bill-form";
import { getUtilityAccount, getUtilityBillsForAccount } from "@/modules/utilities/server/queries";
import { getHousehold } from "@/modules/household/server/queries";
import { isDocumentExtractionConfigured } from "@/modules/documents/server/extract";

export default async function NewUtilityBillPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [t, account, bills, household] = await Promise.all([
    getTranslations("utilities.bill"),
    getUtilityAccount(accountId),
    getUtilityBillsForAccount(accountId),
    getHousehold(),
  ]);

  if (!account) notFound();

  const lastBill = bills.length > 0 ? bills[bills.length - 1] : null;
  const previousReadingDefaults = lastBill
    ? {
        high: Number(lastBill.readings.find((r) => r.band === "HIGH")?.currentReading ?? 0),
        low: Number(lastBill.readings.find((r) => r.band === "LOW")?.currentReading ?? 0),
      }
    : null;

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("addTitle")} — {account.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BillForm
            mode="create"
            accountId={accountId}
            tracksReadings={account.tracksReadings}
            householdCurrency={household.currency}
            // Only electricity bills are modelled by the extraction contract;
            // offering a scan button on a water or internet account would
            // promise something the provider can't classify.
            scanEnabled={isDocumentExtractionConfigured() && account.utilityType === "ELECTRICITY"}
            previousReadingDefaults={previousReadingDefaults}
          />
        </CardContent>
      </Card>
    </div>
  );
}
