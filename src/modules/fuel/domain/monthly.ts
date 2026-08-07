/** Groups fuel entries into calendar months (UTC, since dates are stored
 * as calendar dates — see SRS §9.2). Pure, sorted chronologically. */
export interface MonthlyPoint {
  /** "YYYY-MM" */
  month: string;
  liters: number;
  spending: number;
}

export function groupMonthly(
  entries: { date: Date; liters: number; totalPaid: number }[]
): MonthlyPoint[] {
  const byMonth = new Map<string, MonthlyPoint>();
  for (const entry of entries) {
    const month = `${entry.date.getUTCFullYear()}-${String(entry.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = byMonth.get(month);
    if (existing) {
      existing.liters += entry.liters;
      existing.spending += entry.totalPaid;
    } else {
      byMonth.set(month, { month, liters: entry.liters, spending: entry.totalPaid });
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}
