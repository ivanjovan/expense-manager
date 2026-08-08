import { describe, expect, it } from "vitest";
import { MockDocumentExtractionProvider } from "./mock-provider";
import { DocumentExtractionError } from "./types";
import { documentExtractionSchema } from "../schemas/extraction";
import { applyBillExtraction, applyFuelExtraction } from "../domain/apply";

const page = { data: Buffer.from("not-really-an-image"), mimeType: "image/jpeg" };
const image = [page];
const provider = new MockDocumentExtractionProvider();

describe("MockDocumentExtractionProvider", () => {
  it("returns a contract-valid fuel receipt", async () => {
    const result = await provider.extract(image, "FUEL_RECEIPT");
    expect(documentExtractionSchema.safeParse(result).success).toBe(true);
    expect(result.documentType).toBe("FUEL_RECEIPT");
  });

  it("returns a contract-valid electricity bill with all four readings", async () => {
    const result = await provider.extract(image, "ELECTRICITY_BILL");
    expect(result.documentType).toBe("ELECTRICITY_BILL");
    if (result.documentType !== "ELECTRICITY_BILL") return;
    expect(result.previousReadingHigh?.value).toBeDefined();
    expect(result.currentReadingHigh?.value).toBeDefined();
    expect(result.previousReadingLow?.value).toBeDefined();
    expect(result.currentReadingLow?.value).toBeDefined();
  });

  it("returns a charge breakdown that reconciles", async () => {
    // totalDue must equal totalAmount + previousDebt, or the fixture would
    // be teaching the review screen to trust an impossible bill.
    const result = await provider.extract(image, "ELECTRICITY_BILL");
    if (result.documentType !== "ELECTRICITY_BILL") throw new Error("wrong type");
    const amount = result.totalAmount?.value ?? 0;
    const debt = result.previousDebt?.value ?? 0;
    expect(result.totalDue?.value).toBeCloseTo(amount + debt, 2);
    expect(result.taxAmount?.value).toBeLessThan(amount);
  });

  it("returns UNKNOWN with no type hint rather than guessing", async () => {
    const result = await provider.extract(image);
    expect(result.documentType).toBe("UNKNOWN");
  });

  it("rejects a request with no pages", async () => {
    await expect(provider.extract([])).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it("accepts a two-page bill", async () => {
    const result = await provider.extract([page, page], "ELECTRICITY_BILL");
    expect(result.documentType).toBe("ELECTRICITY_BILL");
  });

  it("rejects an empty image", async () => {
    await expect(
      provider.extract([{ data: Buffer.alloc(0), mimeType: "image/jpeg" }])
    ).rejects.toBeInstanceOf(DocumentExtractionError);
  });

  it("includes at least one low-confidence field in each fixture", async () => {
    // The mock exists to build the review UI against; a fixture where
    // everything is confident would never exercise the flagging path.
    const fuelResult = await provider.extract(image, "FUEL_RECEIPT");
    const billResult = await provider.extract(image, "ELECTRICITY_BILL");
    if (fuelResult.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    if (billResult.documentType !== "ELECTRICITY_BILL") throw new Error("wrong type");

    expect(applyFuelExtraction(fuelResult, "MKD").lowConfidenceFields.length).toBeGreaterThan(0);
    expect(applyBillExtraction(billResult, "MKD", true).lowConfidenceFields.length).toBeGreaterThan(0);
  });

  it("produces fuel values that survive the mapping layer", async () => {
    const result = await provider.extract(image, "FUEL_RECEIPT");
    if (result.documentType !== "FUEL_RECEIPT") throw new Error("wrong type");
    const applied = applyFuelExtraction(result, "MKD");
    expect(applied.values.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(applied.values.totalPaid)).toBeGreaterThan(0);
    expect(applied.currencyMismatch).toBe(false);
  });
});
