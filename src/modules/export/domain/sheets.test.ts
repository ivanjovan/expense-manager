import { describe, expect, it } from "vitest";
import {
  buildFuelEntriesSheet,
  buildMeterReadingsSheet,
  buildUtilityBillsSheet,
  buildVehiclesSheet,
  type ExportLabels,
  type FuelEntryRow,
  type UtilityAccountRow,
  type UtilityBillRow,
  type VehicleRow,
} from "./sheets";
import { numberFormatFor, safeFilenameSegment, safeSheetName, toNumber } from "./workbook-model";

/** Identity labels: assertions read as the column key, so a test failure
 * points at the field rather than at a translation. */
const labels: ExportLabels = {
  sheets: {
    vehicles: "Vehicles",
    fuelEntries: "Fuel entries",
    utilityAccounts: "Accounts",
    utilityBills: "Bills",
    meterReadings: "Readings",
  },
  columns: new Proxy({}, { get: (_t, key) => String(key) }) as Record<string, string>,
  values: { yes: "Yes", no: "No", manual: "Manually", ocr: "Scanned", paid: "Paid", unpaid: "Unpaid" },
  fuelTypes: { DIESEL: "Diesel" },
  utilityTypes: { ELECTRICITY: "Electricity" },
  units: { KWH: "kWh" },
  bands: { HIGH: "High", LOW: "Low" },
};

const vehicle: VehicleRow = {
  id: "v1",
  name: "Citroen",
  manufacturer: "Citroën",
  model: "C4",
  licensePlate: "SK-1234-AB",
  fuelType: "DIESEL",
  initialOdometer: 100000,
  notes: null,
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function entry(over: Partial<FuelEntryRow> & Pick<FuelEntryRow, "id" | "odometer">): FuelEntryRow {
  return {
    vehicleId: "v1",
    date: new Date("2026-08-01T00:00:00Z"),
    fuelPrice: 85.5,
    liters: 40,
    totalPaid: 3420,
    currency: "MKD",
    isFullTank: true,
    missedEntries: false,
    inputMethod: "MANUAL",
    station: null,
    notes: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...over,
  };
}

describe("workbook-model helpers", () => {
  it("converts Prisma Decimal-like values to numbers", () => {
    expect(toNumber({ toString: () => "85.500" })).toBe(85.5);
    expect(toNumber(41.226)).toBe(41.226);
  });

  it("keeps null distinct from zero", () => {
    // A spreadsheet sums blanks and zeros differently — "not measurable"
    // must not read as "used none".
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber(0)).toBe(0);
  });

  it("strips characters Windows rejects in filenames", () => {
    expect(safeFilenameSegment('dom/  "test":*?')).toBe("dom-test");
  });

  it("never returns an empty filename segment", () => {
    expect(safeFilenameSegment("///")).toBe("export");
  });

  it("keeps sheet names inside Excel's 31-character limit", () => {
    const name = safeSheetName("A".repeat(50));
    expect(name.length).toBe(31);
  });

  it("replaces characters Excel forbids in sheet names", () => {
    expect(safeSheetName("Bills [2026]/Q1")).toBe("Bills 2026 Q1");
  });

  it("formats money in the household currency", () => {
    expect(numberFormatFor("money", "MKD")).toContain("MKD");
    expect(numberFormatFor("money", "EUR")).toContain("€");
  });

  it("gives text cells no number format", () => {
    expect(numberFormatFor("text", "MKD")).toBeUndefined();
  });
});

describe("buildVehiclesSheet", () => {
  it("emits one row per vehicle with localized enums", () => {
    const sheet = buildVehiclesSheet([vehicle], labels);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].fuelType).toBe("Diesel");
    expect(sheet.rows[0].archived).toBe("No");
  });

  it("falls back to the raw code for an unmapped enum", () => {
    const sheet = buildVehiclesSheet([{ ...vehicle, fuelType: "HYDROGEN" }], labels);
    expect(sheet.rows[0].fuelType).toBe("HYDROGEN");
  });
});

describe("buildFuelEntriesSheet", () => {
  it("writes numbers as numbers, not formatted strings", () => {
    const sheet = buildFuelEntriesSheet([entry({ id: "e1", odometer: 100500 })], [vehicle], labels);
    expect(sheet.rows[0].liters).toBe(40);
    expect(sheet.rows[0].totalPaid).toBe(3420);
    expect(typeof sheet.rows[0].date).toBe("object");
  });

  it("resolves the vehicle name", () => {
    const sheet = buildFuelEntriesSheet([entry({ id: "e1", odometer: 100500 })], [vehicle], labels);
    expect(sheet.rows[0].vehicle).toBe("Citroen");
  });

  it("joins consumption onto the entry that closes the segment", () => {
    // Three fills, because the engine cannot measure the first segment: the
    // tank state before a vehicle's first recorded fill-up is unknown (SRS
    // §10.4). So e2->e3 is the first measurable span: 500km on 40 litres.
    const entries = [
      entry({ id: "e1", odometer: 99500, date: new Date("2026-07-20T00:00:00Z") }),
      entry({ id: "e2", odometer: 100000, date: new Date("2026-08-01T00:00:00Z") }),
      entry({ id: "e3", odometer: 100500, date: new Date("2026-08-10T00:00:00Z") }),
    ];
    const sheet = buildFuelEntriesSheet(entries, [vehicle], labels);
    expect(sheet.rows[0].consumptionL100km).toBeNull();
    expect(sheet.rows[1].consumptionL100km).toBeNull();
    expect(sheet.rows[2].distanceKm).toBe(500);
    expect(sheet.rows[2].consumptionL100km).toBeCloseTo(8, 6);
  });

  it("leaves the first-ever fill-up unmeasured", () => {
    // Stated as its own case because it is a deliberate absence in the
    // export, not a gap someone should later "fix" by defaulting it to 0.
    const sheet = buildFuelEntriesSheet(
      [entry({ id: "only", odometer: 100000 })],
      [vehicle],
      labels
    );
    expect(sheet.rows[0].consumptionL100km).toBeNull();
  });

  it("leaves consumption blank rather than zero when a segment is invalid", () => {
    // A partial fill can't close a segment; a 0 here would be summed as a
    // real measurement.
    const entries = [
      entry({ id: "e1", odometer: 99500, date: new Date("2026-07-20T00:00:00Z") }),
      entry({ id: "e2", odometer: 100000, date: new Date("2026-08-01T00:00:00Z") }),
      entry({ id: "e3", odometer: 100500, isFullTank: false, date: new Date("2026-08-10T00:00:00Z") }),
    ];
    const sheet = buildFuelEntriesSheet(entries, [vehicle], labels);
    expect(sheet.rows[2].consumptionL100km).toBeNull();
    expect(sheet.rows[2].distanceKm).toBeNull();
  });

  it("never builds a segment spanning two vehicles", () => {
    const second: VehicleRow = { ...vehicle, id: "v2", name: "Yaris" };
    const entries = [
      entry({ id: "a1", vehicleId: "v1", odometer: 100000 }),
      entry({ id: "b1", vehicleId: "v2", odometer: 100500, date: new Date("2026-08-10T00:00:00Z") }),
    ];
    const sheet = buildFuelEntriesSheet(entries, [vehicle, second], labels);
    // Each vehicle has a single entry, so neither can close a segment.
    expect(sheet.rows.every((r) => r.consumptionL100km === null)).toBe(true);
  });

  it("sorts chronologically regardless of input order", () => {
    const entries = [
      entry({ id: "late", odometer: 100500, date: new Date("2026-08-10T00:00:00Z") }),
      entry({ id: "early", odometer: 100000, date: new Date("2026-08-01T00:00:00Z") }),
    ];
    const sheet = buildFuelEntriesSheet(entries, [vehicle], labels);
    expect(sheet.rows[0].odometer).toBe(100000);
  });

  it("labels the input method", () => {
    const sheet = buildFuelEntriesSheet(
      [entry({ id: "e1", odometer: 1, inputMethod: "OCR" })],
      [vehicle],
      labels
    );
    expect(sheet.rows[0].inputMethod).toBe("Scanned");
  });

  it("produces an empty sheet, not a crash, with no entries", () => {
    const sheet = buildFuelEntriesSheet([], [vehicle], labels);
    expect(sheet.rows).toEqual([]);
    expect(sheet.columns.length).toBeGreaterThan(0);
  });
});

const account: UtilityAccountRow = {
  id: "a1",
  name: "EVN",
  utilityType: "ELECTRICITY",
  provider: null,
  accountNumber: null,
  meterNumber: null,
  tracksReadings: true,
  unit: "KWH",
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const bill: UtilityBillRow = {
  id: "b1",
  accountId: "a1",
  periodFrom: new Date("2026-07-01T00:00:00Z"),
  periodTo: new Date("2026-07-31T00:00:00Z"),
  issueDate: new Date("2026-08-03T00:00:00Z"),
  dueDate: new Date("2026-08-20T00:00:00Z"),
  amount: 3187,
  taxAmount: 486.15,
  previousDebt: null,
  currency: "MKD",
  paymentDate: null,
  invoiceNumber: "INV-1",
  notes: null,
  inputMethod: "MANUAL",
  createdAt: new Date("2026-08-03T00:00:00Z"),
  readings: [
    { band: "HIGH", previousReading: 24180, currentReading: 24476, consumption: 296, unit: "KWH", meterRollover: false },
    { band: "LOW", previousReading: 11902, currentReading: 12043, consumption: 141, unit: "KWH", meterRollover: false },
  ],
};

describe("buildUtilityBillsSheet", () => {
  it("derives payment status from the payment date", () => {
    const sheet = buildUtilityBillsSheet([bill], [account], labels);
    expect(sheet.rows[0].paymentStatus).toBe("Unpaid");
    const paid = buildUtilityBillsSheet(
      [{ ...bill, paymentDate: new Date("2026-08-15T00:00:00Z") }],
      [account],
      labels
    );
    expect(paid.rows[0].paymentStatus).toBe("Paid");
  });

  it("exports the charge breakdown and derives the payable total", () => {
    // A backup that dropped the carried-over debt would lose the reason a
    // slip total didn't match the period charge.
    const withDebt = { ...bill, previousDebt: 1240 };
    const row = buildUtilityBillsSheet([withDebt], [account], labels).rows[0];
    expect(row.amount).toBe(3187);
    expect(row.taxAmount).toBe(486.15);
    expect(row.previousDebt).toBe(1240);
    expect(row.totalDue).toBe(4427);
  });

  it("leaves the payable total blank when there is no debt", () => {
    // Otherwise the column would just duplicate `amount` and invite someone
    // to sum the wrong one.
    const row = buildUtilityBillsSheet([bill], [account], labels).rows[0];
    expect(row.previousDebt).toBeNull();
    expect(row.totalDue).toBeNull();
  });

  it("resolves the account name", () => {
    expect(buildUtilityBillsSheet([bill], [account], labels).rows[0].account).toBe("EVN");
  });
});

describe("buildMeterReadingsSheet", () => {
  it("emits one row per tariff band rather than flattening them", () => {
    const sheet = buildMeterReadingsSheet([bill], [account], labels);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows.map((r) => r.band)).toEqual(["High", "Low"]);
    expect(sheet.rows[0].consumption).toBe(296);
  });

  it("skips bills that carry no readings", () => {
    const sheet = buildMeterReadingsSheet([{ ...bill, readings: [] }], [account], labels);
    expect(sheet.rows).toEqual([]);
  });

  it("tolerates a bill with readings undefined", () => {
    const withoutReadings: UtilityBillRow = { ...bill };
    delete withoutReadings.readings;
    const sheet = buildMeterReadingsSheet([withoutReadings], [account], labels);
    expect(sheet.rows).toEqual([]);
  });
});
