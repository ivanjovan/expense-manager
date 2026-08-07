import { getTranslations } from "next-intl/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/shared/components/ui/card";
import { AcceptInviteForm } from "@/modules/household/components/accept-invite-form";
import { getInvitationByToken } from "@/modules/household/server/queries";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [t, invitation] = await Promise.all([
    getTranslations("auth.invite"),
    getInvitationByToken(token),
  ]);

  if (!invitation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invalidTitle")}</CardTitle>
          <CardDescription>{t("invalidBody")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (invitation.expiresAt < new Date()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("expiredTitle")}</CardTitle>
          <CardDescription>{t("expiredBody")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title", { household: invitation.household.name })}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm token={token} />
      </CardContent>
    </Card>
  );
}
