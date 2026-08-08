/**
 * Turns an unknown SDK error into a short, loggable description.
 *
 * Exists because the first real Gemini failure produced only
 * "provider_failed" in the UI and nothing at all in the server logs — the
 * route returned the mapped error before reaching its own console.error, so
 * the cause was discarded at the one moment it mattered.
 *
 * Redaction is the reason this is a function rather than `String(error)`.
 * Google's client puts the API key in the request URL as `?key=...`, and
 * SDK errors routinely echo the URL. Logging the raw message would write a
 * live credential into Vercel's log store, which is exactly the leak the
 * `server-only` guards elsewhere exist to prevent.
 */

/** Query parameters whose values must never reach a log. */
const SECRET_PARAMS = /([?&](?:key|api_?key|access_token|token)=)[^&\s"']+/gi;
/** Bearer tokens and bare Google API keys (AIza...) appearing in prose. */
const BEARER = /(Bearer\s+)[A-Za-z0-9._-]+/gi;
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{10,}/g;

export function redactSecrets(text: string): string {
  return text
    .replace(SECRET_PARAMS, "$1[REDACTED]")
    .replace(BEARER, "$1[REDACTED]")
    .replace(GOOGLE_KEY, "[REDACTED]");
}

/** Pulls an HTTP status off an SDK error, whichever field it used. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; code?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.code === "number") return candidate.code;
  return undefined;
}

/**
 * A one-line, secret-free summary safe to log. Truncated because SDK errors
 * can embed an entire response body, and a log line is a diagnostic, not an
 * archive.
 */
export function describeProviderError(error: unknown, maxLength = 400): string {
  const status = statusOf(error);
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return "unserializable error";
            }
          })();

  const cleaned = redactSecrets(raw).replace(/\s+/g, " ").trim();
  const truncated =
    cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned || "no message";
  return status !== undefined ? `[${status}] ${truncated}` : truncated;
}

/**
 * Maps common provider failures to a hint aimed at whoever reads the log.
 * These three account for nearly every first-run failure, and each has a
 * different fix — "provider_failed" alone sends you looking in the wrong
 * place.
 */
export function providerErrorHint(description: string): string | undefined {
  const text = description.toLowerCase();
  if (/\[404]|not found|is not found for api version|unsupported model/.test(text)) {
    return "The model name looks wrong or retired — set DOCUMENT_EXTRACTION_MODEL to a current one.";
  }
  if (/\[401]|\[403]|api key not valid|permission denied|unauthenticated/.test(text)) {
    return "The API key was rejected — check it is valid and unrestricted for the Generative Language API.";
  }
  if (/location is not supported|user location/.test(text)) {
    return "The Gemini API is not available from this deployment's region.";
  }
  if (/\[429]|quota|rate limit|resource_exhausted/.test(text)) {
    return "Rate limit or quota exhausted — free-tier limits are per-minute and per-day.";
  }
  return undefined;
}
