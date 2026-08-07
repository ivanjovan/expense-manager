import type { useTranslations } from "next-intl";

/**
 * Renders an i18n message key chosen at runtime — e.g. a Server Action's
 * `error`/`fieldErrors` value (SRS §16 requires those to be message keys,
 * not translated text). next-intl's typed `t()` wants a literal key for
 * compile-time safety, which a server-computed `string` can never satisfy;
 * this narrows that one unavoidable cast to a single place instead of
 * scattering `as any` through every form component.
 */
export function translateDynamic(
  t: ReturnType<typeof useTranslations>,
  key: string
): string {
  return t(key as Parameters<typeof t>[0]);
}
