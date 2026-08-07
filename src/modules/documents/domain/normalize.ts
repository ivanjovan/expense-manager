/**
 * Value normalization — pure functions, no I/O.
 *
 * Providers return whatever the document said, which in this region means
 * decimal commas, dotted thousands separators, and dd.mm.yyyy dates. This
 * layer repairs those into the canonical shapes the Zod contract expects,
 * *before* validation runs — so a well-formed value in an unexpected format
 * is fixed rather than dropped as invalid.
 */

/**
 * Parses a number from a receipt, handling both European (`1.234,56`) and
 * Anglo (`1,234.56`) conventions.
 *
 * The rule: whichever of `.` or `,` appears **last** is the decimal
 * separator, since a thousands separator can never be the final one. With
 * only one separator present, it's a decimal point if it's followed by
 * exactly 1–2 digits (`1,45` → 1.45) and a thousands separator if followed
 * by exactly 3 (`1.234` → 1234).
 *
 * That 3-digit case is genuinely ambiguous, and the two readings differ by
 * 1000× — `1.729` is a plausible €/litre price *and* a plausible denar
 * total. Pass `fractional: true` for fields that are inherently fractional
 * (fuel price, litres, meter readings) to resolve it the other way. Getting
 * this wrong on a fuel price would silently corrupt the consumption engine,
 * so the caller states its expectation rather than letting a heuristic guess.
 */
export function parseDecimal(
  raw: string | number | null | undefined,
  options: { fractional?: boolean } = {}
): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;

  // Strip currency symbols, letters, and whitespace; keep digits, separators, sign.
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present — the later one is the decimal separator.
    const decimalIndex = Math.max(lastDot, lastComma);
    const intPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
    const fracPart = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${fracPart}`;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sepIndex = Math.max(lastDot, lastComma);
    const digitsAfter = cleaned.length - sepIndex - 1;
    if (digitsAfter === 3 && !options.fractional) {
      // Exactly three trailing digits — thousands separator, unless the
      // caller told us this field is fractional (e.g. 1.729 €/L).
      normalized = cleaned.replace(/[.,]/g, "");
    } else {
      const intPart = cleaned.slice(0, sepIndex).replace(/[.,]/g, "");
      const fracPart = cleaned.slice(sepIndex + 1);
      normalized = `${intPart}.${fracPart}`;
    }
  } else {
    normalized = cleaned;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normalizes a date into `YYYY-MM-DD`.
 *
 * Ambiguous numeric dates are read **day-first** (`07.08.2026` → 8 August),
 * which is correct for the locales this app serves — a US-format receipt
 * would be misread, so the review screen must always show the date for
 * confirmation rather than trusting this silently.
 */
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already ISO.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return isValidYmd(+iso[1], +iso[2], +iso[3]) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }

  // d/m/y with . / - separators; 2- or 4-digit year.
  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (dmy) {
    const day = +dmy[1];
    const month = +dmy[2];
    const year = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
    if (!isValidYmd(year, month, day)) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Rejects impossible calendar dates (month 13, 31 February) rather than
 * letting Date roll them over into a different, wrong day. */
function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900 || year > 2200) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Maps a currency symbol or code found on a document to a supported code.
 * Returns null for anything unrecognized — the caller then treats currency
 * as simply not extracted rather than guessing. */
export function normalizeCurrency(raw: string | null | undefined): "EUR" | "MKD" | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  if (/EUR|€/.test(value)) return "EUR";
  // "ден"/"DEN" is the denar symbol; MKD is the ISO code.
  if (/MKD|ДЕН|DEN/.test(value)) return "MKD";
  return null;
}

/** Clamps a provider-supplied confidence into 0..1. Providers occasionally
 * return percentages (98) instead of fractions (0.98); a value above 1 is
 * therefore read as a percentage rather than rejected. */
export function normalizeConfidence(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return Math.min(n / 100, 1);
  return n;
}

/** Below this, the review UI marks a field as low-confidence (§10). */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}
