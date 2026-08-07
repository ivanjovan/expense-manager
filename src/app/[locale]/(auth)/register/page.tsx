import { getTranslations } from "next-intl/server";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/shared/components/ui/card";
import { RegisterForm } from "@/modules/household/components/register-form";
import { Link } from "@/i18n/navigation";
import { isRegistrationOpen } from "@/modules/household/server/queries";

export async function generateMetadata() {
  const t = await getTranslations("auth.register");
  return { title: t("title") };
}

export default async function RegisterPage() {
  const [t, open] = await Promise.all([
    getTranslations("auth.register"),
    isRegistrationOpen(),
  ]);

  if (!open) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("closedTitle")}</CardTitle>
          <CardDescription>{t("closedBody")}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
            {t("loginLink")}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        <span>{t("haveAccount")}</span>
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          {t("loginLink")}
        </Link>
      </CardFooter>
    </Card>
  );
}
