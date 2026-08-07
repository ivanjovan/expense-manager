import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { AccountForm } from "@/modules/utilities/components/account-form";
import { getUtilityAccount } from "@/modules/utilities/server/queries";

export default async function EditUtilityAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [t, account] = await Promise.all([
    getTranslations("utilities.account"),
    getUtilityAccount(accountId),
  ]);

  if (!account) notFound();

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t("editTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm
            mode="edit"
            accountId={account.id}
            defaultValues={{
              name: account.name,
              provider: account.provider,
              accountNumber: account.accountNumber,
              meterNumber: account.meterNumber,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
