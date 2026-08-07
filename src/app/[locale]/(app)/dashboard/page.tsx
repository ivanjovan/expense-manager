import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  // Phase 0 exit criteria (SRS §21) is this empty state, localized, behind
  // auth. Vehicle/fuel and utility-bill CTAs attach here once those
  // modules land in Phase 1 and 2.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Card className="border-dashed">
        <CardHeader className="items-center text-center py-16">
          <CardTitle>{t("emptyTitle")}</CardTitle>
          <CardDescription className="max-w-sm">{t("emptyBody")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
