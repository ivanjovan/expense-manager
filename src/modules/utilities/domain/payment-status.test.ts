import { describe, expect, it } from "vitest";
import { derivePaymentStatus } from "./payment-status";

const today = new Date("2026-06-15T00:00:00.000Z");

describe("derivePaymentStatus", () => {
  it("is PAID whenever paymentDate is set, regardless of due date", () => {
    expect(
      derivePaymentStatus(
        { paymentDate: new Date("2026-06-01"), dueDate: new Date("2026-01-01") },
        today
      )
    ).toBe("PAID");
  });

  it("is OVERDUE when unpaid and the due date has passed", () => {
    expect(
      derivePaymentStatus({ paymentDate: null, dueDate: new Date("2026-06-01") }, today)
    ).toBe("OVERDUE");
  });

  it("is UNPAID when unpaid and the due date is today or in the future", () => {
    expect(
      derivePaymentStatus({ paymentDate: null, dueDate: new Date("2026-06-30") }, today)
    ).toBe("UNPAID");
  });
});
