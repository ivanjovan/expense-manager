import { defineRouting } from "next-intl/routing";

/**
 * SRS §7: English (default) and Serbian (Latin script). Path-prefixed so a
 * link is unambiguous and shareable between household members who read
 * different languages against the same data (SRS §6.1).
 */
export const routing = defineRouting({
  locales: ["en", "sr-Latn"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
