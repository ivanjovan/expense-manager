import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/components/ui/card";
import { getUtilityAccounts } from "@/modules/utilities/server/queries";
import { AccountListActions } from "@/modules/utilities/components/account-list-actions";

export async function generateMetadata() {
  const t = await getTranslations("utilities.account");
  return { title: t("title") };
}

export default async function UtilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "true";
  const [t, accounts] = await Promise.all([
    getTranslations("utilities.account"),
    getUtilityAccounts({ includeArchived: showArchived }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={showArchived ? "/utilities" : { pathname: "/utilities", query: { archived: "true" } }}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("showArchived")}
          </Link>
          <Link href="/utilities/new" className={buttonVariants()}>
            {t("addButton")}
          </Link>
        </div>
      </div>

      {accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center py-16">
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription className="max-w-sm">{t("emptyBody")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} className={account.archivedAt ? "opacity-60" : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>
                      <Link href={`/utilities/${account.id}`} className="hover:underline">
                        {account.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>{account.provider || "—"}</CardDescription>
                  </div>
                  {account.archivedAt && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t("archived")}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {account.meterNumber ? `${t("meterNumber")}: ${account.meterNumber}` : "—"}
                </span>
                <AccountListActions
                  accountId={account.id}
                  accountName={account.name}
                  archived={Boolean(account.archivedAt)}
                  hasBills={account._count.bills > 0}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
