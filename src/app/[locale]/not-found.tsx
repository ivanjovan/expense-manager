import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/shared/components/ui/card";

/**
 * Rendered by `notFound()` — which the vehicle, account and bill detail
 * pages already call when an id doesn't resolve within the household. Those
 * calls previously fell through to Next's default 404, outside the app shell
 * and always in English.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("common");

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("notFoundTitle")}</CardTitle>
          <CardDescription>{t("notFoundBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            {t("backToDashboard")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
