import { getTranslations } from "next-intl/server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/shared/components/ui/card";
import { InviteMemberForm } from "@/modules/household/components/invite-member-form";
import {
  getHousehold,
  getHouseholdMembers,
  getPendingInvitations,
} from "@/modules/household/server/queries";
import { requireCurrentUser } from "@/shared/lib/session";
import { ExportButton } from "@/modules/export/components/export-button";

export async function generateMetadata() {
  const t = await getTranslations("household.settings");
  return { title: t("title") };
}

export default async function HouseholdSettingsPage() {
  const [t, tm, tExport, currentUser, household, members, invitations] =
    await Promise.all([
      getTranslations("household.settings"),
      getTranslations("household.members"),
      getTranslations("export"),
      requireCurrentUser(),
      getHousehold(),
      getHouseholdMembers(),
      getPendingInvitations(),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{household.name}</CardTitle>
          <CardDescription>
            {t("currencyLabel")}: {household.currency}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tm("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y divide-border">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-muted-foreground">{member.email}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {member.role === "OWNER" ? tm("roleOwner") : tm("roleMember")}
                </span>
              </li>
            ))}
          </ul>

          {currentUser.role === "OWNER" && (
            <>
              <div className="border-t border-border pt-4">
                <InviteMemberForm />
              </div>

              {invitations.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {tm("pendingInvitations")}
                  </h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {invitations.map((invitation) => (
                      <li key={invitation.id} className="text-muted-foreground">
                        {invitation.email}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Owner-only, per the §6 role table. The route enforces it too —
          this only avoids showing a button that would 403. */}
      {currentUser.role === "OWNER" && (
        <Card>
          <CardHeader>
            <CardTitle>{tExport("fullTitle")}</CardTitle>
            <CardDescription>{tExport("fullBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportButton scope="household" labelKey="fullButton" variant="default" size="default" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
