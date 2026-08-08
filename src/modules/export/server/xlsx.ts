import "server-only";
import ExcelJS from "exceljs";
import type { WorkbookModel } from "../domain/workbook-model";
import { numberFormatFor, safeSheetName } from "../domain/workbook-model";

/**
 * WorkbookModel -> .xlsx bytes.
 *
 * The only file-format-aware code in the module; everything that decides
 * *what* goes in a cell lives in domain/ and is tested without producing a
 * binary.
 *
 * ExcelJS rather than SheetJS: SRS §14 already notes the `xlsx` package on
 * the public npm registry is stale and that current builds come from
 * SheetJS's own CDN. Depending on a non-npm distribution channel for a
 * household app is a maintenance trap, and ExcelJS covers what we need.
 */

/** Empty cells stay genuinely empty. Writing 0 or "" would make "not
 * applicable" indistinguishable from a real zero once someone sums a
 * column — the reason the consumption columns are blank rather than 0. */
function cellValue(value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function writeWorkbook(model: WorkbookModel, currency: "MKD" | "EUR"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  for (const sheet of model.sheets) {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name), {
      // Keeps the header row visible while scrolling a decade of entries.
      views: [{ state: "frozen", ySplit: 1 }],
    });

    worksheet.columns = sheet.columns.map((column) => ({
      key: column.key,
      width: column.width ?? 16,
    }));

    const headerRow = worksheet.addRow(
      Object.fromEntries(sheet.columns.map((c) => [c.key, c.header]))
    );
    headerRow.font = { bold: true };

    for (const row of sheet.rows) {
      worksheet.addRow(
        Object.fromEntries(sheet.columns.map((c) => [c.key, cellValue(row[c.key])]))
      );
    }

    // Formats are applied per column after the rows exist, so numbers are
    // stored as numbers and rendered per the reader's locale rather than
    // being frozen into a string at write time.
    sheet.columns.forEach((column, index) => {
      const format = numberFormatFor(column.type, currency);
      if (!format) return;
      const worksheetColumn = worksheet.getColumn(index + 1);
      worksheetColumn.numFmt = format;
    });

    // Excel's own filter UI, so the recipient can slice the data without us
    // building an export-options screen.
    if (sheet.rows.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columns.length },
      };
    }
  }

  // Guard: a workbook with no sheets is a corrupt file, not an empty one.
  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet("Export");
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
