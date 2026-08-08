"use client";

import { useTranslations } from "next-intl";
import { MOCK_PROVIDER_NAME } from "@/modules/documents/schemas/extraction";
import type { ScanField } from "@/modules/documents/domain/apply";
import { LOW_CONFIDENCE_THRESHOLD } from "@/modules/documents/domain/normalize";

/**
 * The notices a review screen shows about a scan. Kept in one place because
 * both the fuel and the bill form need exactly the same set, and because
 * their severities are a deliberate hierarchy rather than styling choices:
 *
 *   error   — the save is blocked (wrong currency)
 *   warning — the save would fail or mislead (type mismatch, sample data)
 *   info    — a value needs a human decision (low confidence)
 */

export interface ScanNoticesProps {
  /** Provider that produced the extraction, from the API response. */
  provider: string;
  /** Document looked like a different type than the module expected (§5). */
  mismatch: boolean;
  /** Currency on the document, when it isn't the household's. */
  foreignCurrency: string | null;
  householdCurrency: string;
  /** Fields the provider returned but wasn't confident about. */
  lowConfidenceFields: ScanField[];
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "warning" | "info";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-border bg-muted/50 text-muted-foreground";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
      {children}
    </p>
  );
}

export function ScanNotices({
  provider,
  mismatch,
  foreignCurrency,
  householdCurrency,
  lowConfidenceFields,
}: ScanNoticesProps) {
  const t = useTranslations("documents.notices");
  const tf = useTranslations("documents.fields");

  return (
    <div className="flex flex-col gap-2">
      {foreignCurrency && (
        <Notice tone="error">
          {t("currencyMismatch", { documentCurrency: foreignCurrency, householdCurrency })}
        </Notice>
      )}

      {mismatch && <Notice tone="warning">{t("typeMismatch")}</Notice>}

      {provider === MOCK_PROVIDER_NAME && <Notice tone="warning">{t("sampleData")}</Notice>}

      {lowConfidenceFields.length > 0 && (
        <Notice tone="info">
          {t("lowConfidence", {
            count: lowConfidenceFields.length,
            fields: lowConfidenceFields.map((f) => tf(f)).join(", "),
          })}
        </Notice>
      )}
    </div>
  );
}

/**
 * Marks an individual field on the review form. `low` gets an explicit
 * "check this" rather than only a colour, so the flag survives being read
 * on a phone in daylight or by someone who doesn't distinguish amber.
 */
export function FieldScanMark({ confidence }: { confidence: number | undefined }) {
  const t = useTranslations("documents.scan");
  if (confidence === undefined) return null;
  const low = confidence < LOW_CONFIDENCE_THRESHOLD;
  return (
    <span
      className={`whitespace-nowrap text-xs font-medium ${low ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}
    >
      {low ? t("checkValue") : t("scanned")}
    </span>
  );
}
