"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { registerAction } from "@/modules/household/server/auth-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select } from "@/shared/components/ui/select";

function FieldError({
  message,
}: {
  message: string | undefined;
}) {
  const tv = useTranslations();
  if (!message) return null;
  return <p className="text-sm text-destructive">{translateDynamic(tv, message)}</p>;
}

export function RegisterForm() {
  const t = useTranslations("auth.register");
  const tv = useTranslations();
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(
    registerAction.bind(null, locale),
    undefined
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="householdName">{t("householdName")}</Label>
        <Input id="householdName" name="householdName" required />
        <FieldError message={fieldErrors?.householdName} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" autoComplete="name" required />
        <FieldError message={fieldErrors?.name} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <FieldError message={fieldErrors?.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currency">{t("currency")}</Label>
        <Select id="currency" name="currency" defaultValue="MKD" required>
          <option value="MKD">MKD (ден)</option>
          <option value="EUR">EUR (€)</option>
        </Select>
        <FieldError message={fieldErrors?.currency} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError message={fieldErrors?.password} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError message={fieldErrors?.confirmPassword} />
      </div>

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="text-sm text-destructive">
          {translateDynamic(tv, state.error)}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="mt-2">
        {t("submit")}
      </Button>
    </form>
  );
}
