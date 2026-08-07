"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Select } from "@/shared/components/ui/select";

export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      aria-label={t("label")}
      disabled={isPending}
      value={locale}
      className="h-9 w-auto"
      onChange={(event) => {
        const nextLocale = event.target.value as (typeof routing.locales)[number];
        startTransition(() => {
          router.replace(pathname, { locale: nextLocale });
        });
      }}
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {t(l)}
        </option>
      ))}
    </Select>
  );
}
