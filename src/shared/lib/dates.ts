/**
 * Calendar-date helpers — SRS §9.2.
 *
 * Several columns (`periodFrom`, `dueDate`, `paymentDate`, …) are `@db.Date`:
 * they represent a day on a calendar, not a moment in time. Prisma reads
 * those back as UTC midnight, so anything written to or compared against
 * them has to be reduced to the same form first. Mixing a bare `new Date()`
 * — an instant — into that comparison is what made a bill read as overdue on
 * the day it was actually due.
 */

/** Midnight UTC of the calendar day the given instant falls on. */
export function startOfUtcDay(instant: Date): Date {
  return new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate())
  );
}

/** Today as a calendar date, safe to store in a `@db.Date` column. */
export function todayAsCalendarDate(now: Date = new Date()): Date {
  return startOfUtcDay(now);
}
