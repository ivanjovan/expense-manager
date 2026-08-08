import "server-only";
import { prisma } from "@/shared/lib/prisma";
import { requireCurrentUser } from "@/shared/lib/session";
import { derivePaymentStatus } from "../domain/payment-status";
import { groupBillsByMonth, groupBillsByYear } from "../domain/billing-period";

export async function getUtilityAccounts(options: { includeArchived?: boolean } = {}) {
  const user = await requireCurrentUser();
  return prisma.utilityAccount.findMany({
    where: {
      householdId: user.householdId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { bills: true } } },
  });
}

export async function getUtilityAccount(accountId: string) {
  const user = await requireCurrentUser();
  return prisma.utilityAccount.findFirst({
    where: { id: accountId, householdId: user.householdId },
  });
}

export async function getUtilityBill(billId: string) {
  const user = await requireCurrentUser();
  return prisma.utilityBill.findFirst({
    where: { id: billId, householdId: user.householdId },
    include: { readings: true },
  });
}

/** All bills for one account, household-scoped, chronological, with
 * readings — small enough per SRS §18's scale target to load in full
 * (mirrors the fuel module's getFuelEntriesForVehicle). */
export async function getUtilityBillsForAccount(accountId: string) {
  const user = await requireCurrentUser();
  return prisma.utilityBill.findMany({
    where: { accountId, householdId: user.householdId },
    orderBy: { periodFrom: "asc" },
    include: { readings: true, createdBy: { select: { name: true } } },
  });
}

type UtilityBillRow = Awaited<ReturnType<typeof getUtilityBillsForAccount>>[number];

function billKwh(bill: { readings: { consumption: unknown }[] }): number {
  return bill.readings.reduce((sum, r) => sum + Number(r.consumption), 0);
}

export async function getUtilityAccountStats(accountId: string) {
  const bills = await getUtilityBillsForAccount(accountId);
  const today = new Date();

  const totalPaid = bills
    .filter((b) => b.paymentDate !== null)
    .reduce((sum, b) => sum + Number(b.amount), 0);
  const unpaidBills = bills.filter((b) => b.paymentDate === null);
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + Number(b.amount), 0);

  const overdueBills = bills.filter(
    (b) => derivePaymentStatus({ paymentDate: b.paymentDate, dueDate: b.dueDate }, today) === "OVERDUE"
  );

  const amounts = bills.map((b) => Number(b.amount));
  const highestBill = amounts.length > 0 ? Math.max(...amounts) : null;
  const lowestBill = amounts.length > 0 ? Math.min(...amounts) : null;

  // Averaged over calendar months, not over bills. Those coincide only while
  // every bill covers exactly one month; a corrected or off-cycle bill would
  // otherwise drag the "monthly" figure down by splitting one month's spend
  // across two rows.
  const monthlyTotals = groupBillsByMonth(
    bills.map((b) => ({ periodFrom: b.periodFrom, amount: Number(b.amount), kwh: billKwh(b) }))
  );
  const averageMonthlyBill =
    monthlyTotals.length > 0
      ? monthlyTotals.reduce((sum, m) => sum + m.amount, 0) / monthlyTotals.length
      : null;

  const currentMonthTotal = bills
    .filter(
      (b) =>
        b.periodFrom.getUTCFullYear() === today.getUTCFullYear() &&
        b.periodFrom.getUTCMonth() === today.getUTCMonth()
    )
    .reduce((sum, b) => sum + Number(b.amount), 0);
  const currentYearTotal = bills
    .filter((b) => b.periodFrom.getUTCFullYear() === today.getUTCFullYear())
    .reduce((sum, b) => sum + Number(b.amount), 0);

  const nextPaymentDue = unpaidBills
    .slice()
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null;

  const billsWithKwh = bills.map((b) => ({ bill: b, kwh: billKwh(b) })).filter((x) => x.kwh > 0);
  const totalKwh = billsWithKwh.reduce((sum, x) => sum + x.kwh, 0);
  const totalAmountWithKwh = billsWithKwh.reduce((sum, x) => sum + Number(x.bill.amount), 0);
  const averagePricePerUnit = totalKwh > 0 ? totalAmountWithKwh / totalKwh : null;

  const totalKwhByYear = groupBillsByYear(
    bills.map((b) => ({ periodFrom: b.periodFrom, amount: Number(b.amount), kwh: billKwh(b) }))
  );

  const lastBill = bills.length > 0 ? bills[bills.length - 1] : null;

  return {
    bills,
    billCount: bills.length,
    totalPaid,
    totalUnpaid,
    overdueCount: overdueBills.length,
    overdueValue: overdueBills.reduce((sum, b) => sum + Number(b.amount), 0),
    highestBill,
    lowestBill,
    averageMonthlyBill,
    currentMonthTotal,
    currentYearTotal,
    nextPaymentDue,
    averagePricePerUnit,
    totalKwh,
    totalKwhByYear,
    lastBill,
  };
}

/** Household-wide utility summary for the dashboard (SRS §12) — combines
 * every active account's bills. */
export async function getHouseholdUtilitySummary() {
  const user = await requireCurrentUser();
  const accounts = await prisma.utilityAccount.findMany({
    where: { householdId: user.householdId, archivedAt: null },
  });

  if (accounts.length === 0) {
    return { hasAccounts: false as const };
  }

  const today = new Date();
  const bills = await prisma.utilityBill.findMany({
    where: { householdId: user.householdId, accountId: { in: accounts.map((a) => a.id) } },
    orderBy: { periodFrom: "asc" },
  });

  const unpaidBills = bills.filter((b) => b.paymentDate === null);
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + Number(b.amount), 0);
  const overdueBills = bills.filter(
    (b) => derivePaymentStatus({ paymentDate: b.paymentDate, dueDate: b.dueDate }, today) === "OVERDUE"
  );
  const currentMonthTotal = bills
    .filter(
      (b) =>
        b.periodFrom.getUTCFullYear() === today.getUTCFullYear() &&
        b.periodFrom.getUTCMonth() === today.getUTCMonth()
    )
    .reduce((sum, b) => sum + Number(b.amount), 0);
  const currentYearTotal = bills
    .filter((b) => b.periodFrom.getUTCFullYear() === today.getUTCFullYear())
    .reduce((sum, b) => sum + Number(b.amount), 0);
  const nextPaymentDue = unpaidBills
    .slice()
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null;

  return {
    hasAccounts: true as const,
    accountCount: accounts.length,
    currentMonthTotal,
    currentYearTotal,
    unpaidCount: unpaidBills.length,
    totalUnpaid,
    overdueCount: overdueBills.length,
    nextPaymentDue,
  };
}

export type { UtilityBillRow };
