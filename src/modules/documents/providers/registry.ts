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

function requireApiKey(): string {
  const apiKey = env.DOCUMENT_EXTRACTION_API_KEY;
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
      cached = new GeminiDocumentExtractionProvider(requireApiKey(), env.DOCUMENT_EXTRACTION_MODEL);
      return cached;
    }

    case "claude": {
      cached = new ClaudeDocumentExtractionProvider(requireApiKey());
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
