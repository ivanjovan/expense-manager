import type { AbstractIntlMessages } from "next-intl";

/**
 * Trims the message bundle down to what the browser actually needs.
 *
 * `NextIntlClientProvider` serialises whatever it is given into the RSC
 * payload of every page. Most of the bundle genuinely is needed there, but
 * the spreadsheet vocabulary is not: `export.columns` alone is 44 header
 * strings that only `export/server/build-export.ts` ever reads, via
 * `getTranslations` on the server. Together these six subtrees are about an
 * eighth of the bundle, shipped on every navigation to be used never.
 *
 * The rest of the `export` namespace — the button labels, the owner-only
 * notice — stays, because `ExportButton` is a Client Component.
 *
 * If one of these is ever needed client-side, next-intl raises a missing
 * message error naming the exact key, which surfaces immediately in
 * development. `client-messages.test.ts` guards the other direction: that
 * each path listed here still exists, so a rename can't quietly turn this
 * into a no-op.
 */
export const SERVER_ONLY_MESSAGE_PATHS: readonly (readonly [string, string])[] = [
  ["export", "sheets"],
  ["export", "columns"],
  ["export", "values"],
  ["export", "utilityTypes"],
  ["export", "units"],
  ["export", "bands"],
] as const;

export function pickClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  const result: AbstractIntlMessages = { ...messages };

  for (const [namespace, key] of SERVER_ONLY_MESSAGE_PATHS) {
    const branch = result[namespace];
    if (typeof branch !== "object" || branch === null) continue;
    // Shallow-copied per namespace so the source bundle — a module-level
    // import, shared across requests — is never mutated.
    const copy: AbstractIntlMessages = { ...(branch as AbstractIntlMessages) };
    delete copy[key];
    result[namespace] = copy;
  }

  return result;
}
