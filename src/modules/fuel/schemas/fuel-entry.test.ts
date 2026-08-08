import { describe, expect, it } from "vitest";
import { fuelEntrySchema } from "./fuel-entry";

/**
 * The form posts FormData, so these go through the same coercion path the
 * action does. `inputMethod` in particular must default rather than fail:
 * a browser holding a cached bundle from before this field existed would
 * otherwise have every save rejected.
 */

function formData(overrides: Record<string, string> = {}) {
  return {
    vehicleId: "v1",
    date: "2026-08-05",
    odometer: "120000",
    fuelPrice: "85.5",
    liters: "41.226",
    totalPaid: "3524.82",
    ...overrides,
  };
}

describe("fuelEntrySchema — inputMethod", () => {
  it("defaults to MANUAL when the field is absent", () => {
    const parsed = fuelEntrySchema.safeParse(formData());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inputMethod).toBe("MANUAL");
  });

  it("accepts OCR from a scanned submission", () => {
    const parsed = fuelEntrySchema.safeParse(formData({ inputMethod: "OCR" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inputMethod).toBe("OCR");
  });

  it("rejects an unrecognized provenance value", () => {
    expect(fuelEntrySchema.safeParse(formData({ inputMethod: "GUESSED" })).success).toBe(false);
  });

  it("treats an absent isFullTank checkbox as false", () => {
    // The scan flow un-answers this and re-answers it explicitly; an
    // unchecked box must not silently become true.
    const parsed = fuelEntrySchema.safeParse(formData());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isFullTank).toBe(false);
  });

  it("treats a present isFullTank checkbox as true", () => {
    const parsed = fuelEntrySchema.safeParse(formData({ isFullTank: "on" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isFullTank).toBe(true);
  });
});
