import "server-only";
import { env } from "@/shared/lib/env";
import { ClaudeDocumentExtractionProvider } from "./claude-provider";
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

export function isDocumentExtractionConfigured(): boolean {
  return Boolean(env.DOCUMENT_EXTRACTION_API_KEY);
}

export function getDocumentExtractionProvider(): DocumentExtractionProvider {
  if (cached) return cached;

  const apiKey = env.DOCUMENT_EXTRACTION_API_KEY;
  if (!apiKey) {
    throw new DocumentExtractionError(
      "provider_not_configured",
      "DOCUMENT_EXTRACTION_API_KEY is not set"
    );
  }

  switch (env.DOCUMENT_EXTRACTION_PROVIDER) {
    case "claude":
      cached = new ClaudeDocumentExtractionProvider(apiKey);
      return cached;
    default:
      throw new DocumentExtractionError(
        "provider_not_configured",
        `Unknown document extraction provider: ${env.DOCUMENT_EXTRACTION_PROVIDER}`
      );
  }
}
