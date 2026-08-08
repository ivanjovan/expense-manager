import { describe, expect, it } from "vitest";
import { derivePaymentStatus } from "./payment-status";

/**
 * A mid-day instant on purpose. The production callers pass `new Date()`,
 * never a midnight boundary, and an earlier version of these tests only
 * passed because it used UTC midnight here — which hid a bill due *today*
 * being reported OVERDUE for the whole of its due date.
 */
const today = new Date("2026-06-15T10:00:00.000Z");

/** Mirrors how `@db.Date` values come back from Prisma: UTC midnight. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("derivePaymentStatus", () => {
  it("is PAID whenever paymentDate is set, regardless of due date", () => {
    expect(
      derivePaymentStatus({ paymentDate: day("2026-06-01"), dueDate: day("2026-01-01") }, today)
    ).toBe("PAID");
  });

  it("is OVERDUE when unpaid and the due date has passed", () => {
    expect(
      derivePaymentStatus({ paymentDate: null, dueDate: day("2026-06-01") }, today)
    ).toBe("OVERDUE");
  });

  it("is UNPAID when unpaid and the due date is in the future", () => {
    expect(
      derivePaymentStatus({ paymentDate: null, dueDate: day("2026-06-30") }, today)
    ).toBe("UNPAID");
  });

  it("is UNPAID for the whole of the day the bill is due", () => {
    const dueToday = day("2026-06-15");
    for (const hour of ["00:00", "10:00", "23:59"]) {
      expect(
        derivePaymentStatus(
          { paymentDate: null, dueDate: dueToday },
          new Date(`2026-06-15T${hour}:00.000Z`)
        )
      ).toBe("UNPAID");
    }
  });

  it("becomes OVERDUE the moment the next day starts", () => {
    expect(
      derivePaymentStatus(
        { paymentDate: null, dueDate: day("2026-06-15") },
        new Date("2026-06-16T00:00:00.000Z")
      )
    ).toBe("OVERDUE");
  });
});
