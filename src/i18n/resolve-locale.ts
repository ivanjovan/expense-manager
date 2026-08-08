import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "./routing";

/**
 * Locale resolution for routes that sit outside the `/[locale]/` segment.
 *
 * next-intl derives the locale from the path prefix, so anything under
 * /api has no request locale and silently falls back to the default. For a
 * page that would be obvious; for a generated file it is not — the download
 * just arrives in the wrong language.
 *
 * Callers therefore pass the locale explicitly. The chain is:
 *
 *   1. an explicit, validated value (what the user is actually reading —
 *      the locale switcher changes the URL without persisting anything, so
 *      this is the only source that reflects a mid-session switch)
 *   2. the viewer's stored preference, for a URL opened directly
 *   3. the default
 */

/** Prisma's Locale enum -> the app's locale tags. */
export function localeFromPrisma(value: string | null | undefined): AppLocale | undefined {
  if (value === "SR_LATN") return "sr-Latn";
  if (value === "EN") return "en";
  return undefined;
}

/** Narrows untrusted input (a query param) to a supported locale. */
export function resolveLocale(
  explicit: string | null | undefined,
  storedPreference?: string | null
): AppLocale {
  if (hasLocale(routing.locales, explicit)) return explicit;
  const stored = localeFromPrisma(storedPreference);
  if (stored) return stored;
  return routing.defaultLocale;
}
