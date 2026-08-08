import "server-only";
import { env } from "@/shared/lib/env";
import { ClaudeDocumentExtractionProvider } from "./claude-provider";
import { GeminiDocumentExtractionProvider } from "./gemini-provider";
import { MockDocumentExtractionProvider } from "./mock-provider";
import { DocumentExtractionError, type DocumentExtractionProvider } from "./types";

/**
 * Resolves the configured provider (§23). Adding a provider means adding a
 * case here and a class file — nothing else in the app changes.
 *
 * Kept lazy so a missing key is an error only when someone actually tries
 * to scan, not at boot: scanning is optional, and the rest of the app must
 * run fine without it.
 */

let cached: DocumentExtractionProvider | null = null;

/**
 * `alias` lets a provider accept the variable name its own ecosystem uses,
 * so a key provisioned under the vendor's conventional name works without
 * being duplicated into a second variable. The generic name still wins, so
 * an explicit choice always beats an inherited one.
 */
function requireApiKey(alias?: string): string {
  const apiKey = env.DOCUMENT_EXTRACTION_API_KEY ?? alias;
  if (!apiKey) {
    throw new DocumentExtractionError(
      "provider_not_configured",
      "DOCUMENT_EXTRACTION_API_KEY is not set"
    );
  }
  return apiKey;
}

/** Whether scanning can be offered at all. The UI hides its entry points
 * when this is false rather than showing a button that always fails. */
export function isDocumentExtractionConfigured(): boolean {
  if (env.DOCUMENT_EXTRACTION_PROVIDER === "mock") return true;
  if (env.DOCUMENT_EXTRACTION_PROVIDER === "gemini") {
    return Boolean(env.DOCUMENT_EXTRACTION_API_KEY ?? env.GOOGLE_GENERATIVE_AI_API_KEY);
  }
  return Boolean(env.DOCUMENT_EXTRACTION_API_KEY);
}

export function getDocumentExtractionProvider(): DocumentExtractionProvider {
  if (cached) return cached;

  switch (env.DOCUMENT_EXTRACTION_PROVIDER) {
    case "mock":
      // No credential — that's the point of it.
      cached = new MockDocumentExtractionProvider();
      return cached;

    case "gemini": {
      cached = new GeminiDocumentExtractionProvider(
        requireApiKey(env.GOOGLE_GENERATIVE_AI_API_KEY),
        env.DOCUMENT_EXTRACTION_MODEL
      );
      return cached;
    }

    case "claude": {
      cached = new ClaudeDocumentExtractionProvider(
        requireApiKey(),
        env.DOCUMENT_EXTRACTION_MODEL
      );
      return cached;
    }

    default:
      throw new DocumentExtractionError(
        "provider_not_configured",
        `Unknown document extraction provider: ${env.DOCUMENT_EXTRACTION_PROVIDER}`
      );
  }
}

/** Test seam — the registry caches, and a test switching providers would
 * otherwise get whichever one ran first. */
export function resetDocumentExtractionProvider(): void {
  cached = null;
}
