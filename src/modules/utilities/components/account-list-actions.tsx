"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  archiveUtilityAccount,
  unarchiveUtilityAccount,
  deleteUtilityAccount,
} from "@/modules/utilities/server/account-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";

export function AccountListActions({
  accountId,
  accountName,
  archived,
  hasBills,
}: {
  accountId: string;
  accountName: string;
  archived: boolean;
  hasBills: boolean;
}) {
  const t = useTranslations("utilities.account");
  const tv = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? null);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {archived ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => unarchiveUtilityAccount(accountId))}
          >
            {t("unarchiveButton")}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => archiveUtilityAccount(accountId))}
          >
            {t("archiveButton")}
          </Button>
        )}
        {!hasBills && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(t("confirmDelete", { name: accountName }))) {
                run(() => deleteUtilityAccount(accountId));
              }
            }}
          >
            {t("deleteButton")}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{translateDynamic(tv, error)}</p>}
    </div>
  );
}
