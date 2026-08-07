"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { loginAction } from "@/modules/household/server/auth-actions";
import { translateDynamic } from "@/shared/lib/translate-dynamic";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const tv = useTranslations();
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(
    loginAction.bind(null, locale),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state && !state.ok && state.fieldErrors?.email)}
        />
        {state && !state.ok && state.fieldErrors?.email && (
          <p className="text-sm text-destructive">{translateDynamic(tv, state.fieldErrors.email)}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state && !state.ok && state.fieldErrors?.password)}
        />
        {state && !state.ok && state.fieldErrors?.password && (
          <p className="text-sm text-destructive">{translateDynamic(tv, state.fieldErrors.password)}</p>
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
