import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { AccountForm } from "@/modules/utilities/components/account-form";

export async function generateMetadata() {
  const t = await getTranslations("utilities.account");
  return { title: t("addTitle") };
}

export default async function NewUtilityAccountPage() {
  const t = await getTranslations("utilities.account");

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
