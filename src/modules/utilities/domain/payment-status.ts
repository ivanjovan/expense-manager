import { startOfUtcDay } from "@/shared/lib/dates";

/**
 * Payment status is derived, never stored — SRS §11.2. Storing it invites
 * drift (a bill that's overdue today wasn't overdue yesterday, with no
 * write to mark the transition).
 */
export type PaymentStatus = "PAID" | "OVERDUE" | "UNPAID";

export function derivePaymentStatus(
  bill: { paymentDate: Date | null; dueDate: Date },
  today: Date = new Date()
): PaymentStatus {
  if (bill.paymentDate) return "PAID";
  // Both sides are reduced to a calendar day first: `dueDate` is UTC midnight
  // from a `@db.Date` column, while callers pass the current instant. Comparing
  // those directly marked a bill OVERDUE from 00:00 UTC on its own due date.
  return startOfUtcDay(bill.dueDate) < startOfUtcDay(today) ? "OVERDUE" : "UNPAID";
}
