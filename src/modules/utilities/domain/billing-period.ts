/** Groups bills into calendar months/years by `periodFrom` (UTC — dates
 * are calendar dates, see SRS §9.2). Pure, sorted chronologically. */
export interface MonthlyBillPoint {
  /** "YYYY-MM" */
  month: string;
  amount: number;
  kwh: number;
}

export interface YearlyBillPoint {
  year: number;
  amount: number;
  kwh: number;
}

interface BillLike {
  periodFrom: Date;
  amount: number;
  kwh: number;
}

export function groupBillsByMonth(bills: BillLike[]): MonthlyBillPoint[] {
  const byMonth = new Map<string, MonthlyBillPoint>();
  for (const bill of bills) {
    const month = `${bill.periodFrom.getUTCFullYear()}-${String(bill.periodFrom.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = byMonth.get(month);
    if (existing) {
      existing.amount += bill.amount;
      existing.kwh += bill.kwh;
    } else {
      byMonth.set(month, { month, amount: bill.amount, kwh: bill.kwh });
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function groupBillsByYear(bills: BillLike[]): YearlyBillPoint[] {
  const byYear = new Map<number, YearlyBillPoint>();
  for (const bill of bills) {
    const year = bill.periodFrom.getUTCFullYear();
    const existing = byYear.get(year);
    if (existing) {
      existing.amount += bill.amount;
      existing.kwh += bill.kwh;
    } else {
      byYear.set(year, { year, amount: bill.amount, kwh: bill.kwh });
    }
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}
