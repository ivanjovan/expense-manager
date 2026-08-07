import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { BillForm } from "@/modules/utilities/components/bill-form";
import { getUtilityAccount, getUtilityBill } from "@/modules/utilities/server/queries";

export default async function EditUtilityBillPage({
  params,
}: {
  params: Promise<{ accountId: string; billId: string }>;
}) {
  const { accountId, billId } = await params;
  const [t, account, bill] = await Promise.all([
    getTranslations("utilities.bill"),
    getUtilityAccount(accountId),
    getUtilityBill(billId),
  ]);

  if (!account || !bill || bill.accountId !== accountId) notFound();

  const highReading = bill.readings.find((r) => r.band === "HIGH");
  const lowReading = bill.readings.find((r) => r.band === "LOW");

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>
            {t("editTitle")} — {account.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BillForm
            mode="edit"
            accountId={accountId}
            billId={bill.id}
            tracksReadings={account.tracksReadings}
            defaultValues={{
              periodFrom: bill.periodFrom.toISOString().slice(0, 10),
              periodTo: bill.periodTo.toISOString().slice(0, 10),
              issueDate: bill.issueDate ? bill.issueDate.toISOString().slice(0, 10) : null,
              dueDate: bill.dueDate.toISOString().slice(0, 10),
              amount: Number(bill.amount),
              paymentDate: bill.paymentDate ? bill.paymentDate.toISOString().slice(0, 10) : null,
              invoiceNumber: bill.invoiceNumber,
              notes: bill.notes,
              readingHigh: highReading
                ? {
                    previousReading: Number(highReading.previousReading),
                    currentReading: Number(highReading.currentReading),
                    meterRollover: highReading.meterRollover,
                  }
                : null,
              readingLow: lowReading
                ? {
                    previousReading: Number(lowReading.previousReading),
                    currentReading: Number(lowReading.currentReading),
                    meterRollover: lowReading.meterRollover,
                  }
                : null,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
