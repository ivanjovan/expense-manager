import { describe, expect, it } from "vitest";
import { describeProviderError, isDailyQuotaExhausted, isRetryableStatus, providerErrorHint, redactSecrets } from "./provider-error";

/**
 * Redaction is the security-relevant half of this module: Google's client
 * puts the API key in the request URL, SDK errors echo that URL, and this
 * output goes straight into Vercel's log store.
 */

describe("redactSecrets", () => {
  it("removes an API key from a query string", () => {
    const raw = "GET https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyFAKEKEY123456 failed";
    const out = redactSecrets(raw);
    expect(out).not.toContain("AIzaSyFAKEKEY123456");
    expect(out).toContain("key=[REDACTED]");
  });

  it("removes a bare Google key appearing in prose", () => {
    const out = redactSecrets("API key AIzaSyABCDEFGHIJKLMNOP is invalid");
    expect(out).not.toContain("AIzaSyABCDEFGHIJKLMNOP");
  });

  it("removes bearer tokens", () => {
    const out = redactSecrets("Authorization: Bearer ya29.a0AfH6SMxxxxxxxx");
    expect(out).not.toContain("ya29.a0AfH6SMxxxxxxxx");
    expect(out).toContain("Bearer [REDACTED]");
  });

  it("removes access_token and api_key parameters too", () => {
    expect(redactSecrets("?access_token=abc123&x=1")).toContain("access_token=[REDACTED]");
    expect(redactSecrets("&api_key=zzz999")).toContain("api_key=[REDACTED]");
  });

  it("leaves harmless text alone", () => {
    expect(redactSecrets("model gemini-2.5-flash not found")).toBe("model gemini-2.5-flash not found");
  });
});

describe("describeProviderError", () => {
  it("prefixes an HTTP status when the SDK provides one", () => {
    const error = Object.assign(new Error("Model not found"), { status: 404 });
    expect(describeProviderError(error)).toBe("[404] Model not found");
  });

  it("handles a plain Error with no status", () => {
    expect(describeProviderError(new Error("network down"))).toBe("network down");
  });

  it("handles a thrown string", () => {
    expect(describeProviderError("boom")).toBe("boom");
  });

  it("handles a thrown object", () => {
    expect(describeProviderError({ detail: "odd" })).toContain("odd");
  });

  it("never throws on an unserializable value", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeProviderError(circular)).not.toThrow();
  });

  it("truncates a very long body", () => {
    const error = new Error("x".repeat(5000));
    expect(describeProviderError(error).length).toBeLessThan(450);
  });

  it("collapses newlines so one failure stays one log line", () => {
    expect(describeProviderError(new Error("a\n\nb"))).toBe("a b");
  });

  it("redacts before returning", () => {
    const error = new Error("call to ?key=AIzaSyLEAKED0000 failed");
    expect(describeProviderError(error)).not.toContain("AIzaSyLEAKED0000");
  });

  it("degrades to a placeholder rather than an empty string", () => {
    expect(describeProviderError(new Error(""))).toBe("no message");
  });
});

describe("providerErrorHint", () => {
  it("recognizes a retired or misspelled model", () => {
    expect(providerErrorHint("[404] models/gemini-9-turbo is not found for API version v1beta"))
      .toMatch(/DOCUMENT_EXTRACTION_MODEL/);
  });

  it("recognizes a rejected key", () => {
    expect(providerErrorHint("[400] API key not valid. Please pass a valid API key.")).toMatch(/API key/);
    expect(providerErrorHint("[403] Permission denied")).toMatch(/API key/);
  });

  it("recognizes an unsupported region", () => {
    expect(providerErrorHint("[400] User location is not supported for the API use."))
      .toMatch(/region/);
  });

  it("recognizes quota exhaustion", () => {
    expect(providerErrorHint("[429] Resource has been exhausted")).toMatch(/quota|limit/i);
  });

  it("returns nothing for an unrecognized failure", () => {
    expect(providerErrorHint("[500] internal error")).toBeUndefined();
  });
});

describe("isRetryableStatus", () => {
  it("retries the transient provider failures", () => {
    // 503 "high demand" showed up on the second live call during testing.
    expect(isRetryableStatus("[503] This model is currently experiencing high demand")).toBe(true);
    expect(isRetryableStatus("[429] Resource exhausted")).toBe(true);
    expect(isRetryableStatus("[500] internal")).toBe(true);
  });

  it("does not retry our own mistakes", () => {
    // A wrong model name will never succeed; retrying only delays the report.
    expect(isRetryableStatus("[404] model not found")).toBe(false);
    expect(isRetryableStatus("[400] API key not valid")).toBe(false);
    expect(isRetryableStatus("[403] permission denied")).toBe(false);
  });

  it("does not retry when there is no status to judge", () => {
    expect(isRetryableStatus("network down")).toBe(false);
    expect(isRetryableStatus("")).toBe(false);
  });
});

describe("daily quota", () => {
  const DAILY =
    '[429] Quota exceeded for metric: generate_content_free_tier_requests, limit: 20 ' +
    '"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"';

  it("recognizes the per-day free-tier limit", () => {
    expect(isDailyQuotaExhausted(DAILY)).toBe(true);
  });

  it("does not retry a limit that will not clear in seconds", () => {
    // Retrying a daily cap only triples the delay before telling the user
    // something they have to act on.
    expect(isRetryableStatus(DAILY)).toBe(false);
  });

  it("still retries a per-minute rate limit", () => {
    expect(isRetryableStatus("[429] Resource exhausted, please retry")).toBe(true);
  });

  it("tells the user how to get working again today", () => {
    expect(providerErrorHint(DAILY)).toMatch(/DOCUMENT_EXTRACTION_MODEL|resets tomorrow/i);
  });
});
