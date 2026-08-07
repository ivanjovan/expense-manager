"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createUtilityAccount, updateUtilityAccount } from "@/modules/utilities/server/account-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

interface AccountFormProps {
  mode: "create" | "edit";
  accountId?: string;
  defaultValues?: {
    name: string;
    provider: string | null;
    accountNumber: string | null;
    meterNumber: string | null;
  };
}

function FieldError({ message }: { message: string | undefined }) {
  const tv = useTranslations();
  if (!message) return null;
  return <p className="text-sm text-destructive">{translateDynamic(tv, message)}</p>;
}

export function AccountForm({ mode, accountId, defaultValues }: AccountFormProps) {
  const t = useTranslations("utilities.account");
  const tc = useTranslations("common");
  const tv = useTranslations();
  const router = useRouter();

  const action = mode === "edit" ? updateUtilityAccount.bind(null, accountId!) : createUtilityAccount;
  const [state, formAction, isPending] = useActionState(action, undefined);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  React.useEffect(() => {
    if (state?.ok) {
      router.push(`/utilities/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required defaultValue={defaultValues?.name} />
        <FieldError message={fieldErrors?.name} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider">{t("provider")}</Label>
        <Input id="provider" name="provider" defaultValue={defaultValues?.provider ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accountNumber">{t("accountNumber")}</Label>
          <Input id="accountNumber" name="accountNumber" defaultValue={defaultValues?.accountNumber ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meterNumber">{t("meterNumber")}</Label>
          <Input id="meterNumber" name="meterNumber" defaultValue={defaultValues?.meterNumber ?? ""} />
        </div>
      </div>

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="text-sm text-destructive">
          {translateDynamic(tv, state.error)}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {t("submit")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}
