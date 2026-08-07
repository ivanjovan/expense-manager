import { z } from "zod";

/**
 * Every Server Action returns this discriminated union rather than throwing
 * across the client/server boundary. `fieldErrors` values are i18n message
 * keys, not translated text — see SRS §16.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  // z.flattenError() infers `fieldErrors` from the schema's static type
  // parameter; called generically here across differently-shaped schemas,
  // so TS can't narrow it. The runtime shape is always
  // Record<string, string[] | undefined> — asserted, not guessed.
  const { fieldErrors } = z.flattenError(error) as {
    fieldErrors: Record<string, string[] | undefined>;
  };
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      result[field] = messages[0];
    }
  }
  return result;
}
