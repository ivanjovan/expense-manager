"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { acceptInviteAction } from "@/modules/household/server/auth-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("auth.invite");
  const tv = useTranslations();
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(
    acceptInviteAction.bind(null, locale),
    undefined
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" autoComplete="name" required />
        {fieldErrors?.name && (
          <p className="text-sm text-destructive">{translateDynamic(tv, fieldErrors.name)}</p>
        )}
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
        {fieldErrors?.password && (
          <p className="text-sm text-destructive">{translateDynamic(tv, fieldErrors.password)}</p>
        )}
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
        {fieldErrors?.confirmPassword && (
          <p className="text-sm text-destructive">
            {translateDynamic(tv, fieldErrors.confirmPassword)}
          </p>
        )}
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
