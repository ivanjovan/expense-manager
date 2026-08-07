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
  return bill.dueDate < today ? "OVERDUE" : "UNPAID";
}
