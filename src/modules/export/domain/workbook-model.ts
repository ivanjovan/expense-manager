/**
 * The shape of an export, independent of any file format — SRS §14.2.
 *
 * Rows carry typed JavaScript values (Date, number, boolean), never
 * pre-formatted strings. That is the whole point: writing "85,50" into a
 * cell produces text that Excel can't sum, and writing "85.50" into a
 * Serbian-locale Excel can be read as eighty-five thousand five hundred.
 * The same 1000x ambiguity the scan importer guards against in
 * documents/domain/normalize.ts applies in reverse on the way out. Handing
 * the writer a real number and a format lets Excel render it in whatever
 * locale the recipient is running.
 *
 * Keeping this layer free of ExcelJS also means the shaping is testable
 * without producing a binary, and a CSV writer could be added later against
 * the same model.
 */

export type CellType = "text" | "number" | "decimal" | "money" | "date" | "boolean";

export interface ColumnModel {
  /** Key into the row record. */
  key: string;
  /** Localized header (§13 — no hardcoded user-facing strings). */
  header: string;
  type: CellType;
  width?: number;
}

export interface SheetModel {
  name: string;
  columns: ColumnModel[];
  rows: Record<string, unknown>[];
}

export interface WorkbookModel {
  /** Suggested download filename, without extension. */
  filename: string;
  sheets: SheetModel[];
}

/**
 * Excel number formats per cell type. `money` is resolved against the
 * household currency so the exported file reads in the household's own
 * terms rather than a bare number (§8).
 *
 * MKD has no Excel-native currency token, so the code is quoted as a
 * literal suffix — the same problem `Intl.NumberFormat` has with MKD, which
 * §8.1 already documents.
 */
export function numberFormatFor(type: CellType, currency: "MKD" | "EUR"): string | undefined {
  switch (type) {
    case "money":
      return currency === "EUR" ? '#,##0.00\\ "€"' : '#,##0.00\\ "MKD"';
    case "decimal":
      return "#,##0.000";
    case "number":
      return "#,##0";
    case "date":
      // ISO in the file itself; Excel re-renders per the reader's locale.
      return "yyyy-mm-dd";
    default:
      return undefined;
  }
}

/** Prisma returns Decimal objects; everything downstream wants a number.
 * Null propagates so an empty cell stays empty rather than becoming 0 —
 * "no payment date" and "paid nothing" are different facts. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Filenames end up on a Windows filesystem, where `\ / : * ? " < > |` are
 * illegal and would make the download fail rather than merely look odd.
 * Also collapses whitespace, which breaks naive Content-Disposition parsing.
 */
export function safeFilenameSegment(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 60) || "export";
}

/** Excel rejects sheet names over 31 chars, containing []:*?/\, or blank —
 * silently corrupting the file rather than erroring, so it is enforced here. */
export function safeSheetName(raw: string): string {
  const cleaned = raw.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 31) || "Sheet";
}
