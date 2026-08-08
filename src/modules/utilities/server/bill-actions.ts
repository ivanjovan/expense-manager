"use server";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/shared/lib/prisma";
import { requireCurrentUser } from "@/shared/lib/session";
import { ActionResult, fieldErrorsFromZod } from "@/shared/types/action-result";
import { utilityBillSchema, type UtilityBillInput } from "../schemas/utility-bill";
import { computeReadingConsumption } from "../domain/reading-consumption";

function cleanOptional(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value.trim() : null;
}

interface ReadingsResult {
  ok: true;
  readings: {
    band: "HIGH" | "LOW";
    previousReading: number;
    currentReading: number;
    consumption: number;
    unit: "KWH";
    meterRollover: boolean;
  }[];
}
interface ReadingsError {
  ok: false;
  fieldErrors: Record<string, string>;
}

/** Both bands are required together on a dual-tariff account — a missing
 * band would silently understate consumption and inflate price per kWh.
 * See SRS §11.3. */
function buildReadings(input: UtilityBillInput): ReadingsResult | ReadingsError {
  const fieldErrors: Record<string, string> = {};

  if (input.previousReadingHigh === undefined) fieldErrors.previousReadingHigh = "validation.required";
  if (input.currentReadingHigh === undefined) fieldErrors.currentReadingHigh = "validation.required";
  if (input.previousReadingLow === undefined) fieldErrors.previousReadingLow = "validation.required";
  if (input.currentReadingLow === undefined) fieldErrors.currentReadingLow = "validation.required";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const previousHigh = input.previousReadingHigh!;
  const currentHigh = input.currentReadingHigh!;
  const previousLow = input.previousReadingLow!;
  const currentLow = input.currentReadingLow!;

  if (!input.rolloverHigh && currentHigh < previousHigh) {
    fieldErrors.currentReadingHigh = "utilities.bill.readingBelowPreviousError";
  }
  if (!input.rolloverLow && currentLow < previousLow) {
    fieldErrors.currentReadingLow = "utilities.bill.readingBelowPreviousError";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    readings: [
      {
        band: "HIGH",
        previousReading: previousHigh,
        currentReading: currentHigh,
        consumption: computeReadingConsumption(previousHigh, currentHigh, input.rolloverHigh),
        unit: "KWH",
        meterRollover: input.rolloverHigh,
      },
      {
        band: "LOW",
        previousReading: previousLow,
        currentReading: currentLow,
        consumption: computeReadingConsumption(previousLow, currentLow, input.rolloverLow),
        unit: "KWH",
        meterRollover: input.rolloverLow,
      },
    ],
  };
}

function isDuplicatePeriodError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createUtilityBill(
  _prevState: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const user = await requireCurrentUser();
  const parsed = utilityBillSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const account = await prisma.utilityAccount.findFirst({
    where: { id: input.accountId, householdId: user.householdId },
  });
  if (!account) {
    return { ok: false, error: "validation.invalidToken" };
  }

  let readings: ReadingsResult["readings"] = [];
  if (account.tracksReadings) {
    const result = buildReadings(input);
    if (!result.ok) {
      return { ok: false, error: "validation.required", fieldErrors: result.fieldErrors };
    }
    readings = result.readings;
  }

  const household = await prisma.household.findUniqueOrThrow({
    where: { id: user.householdId },
    select: { currency: true },
  });

  try {
    const bill = await prisma.utilityBill.create({
      data: {
        householdId: user.householdId,
        accountId: input.accountId,
        createdByUserId: user.id,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        amount: input.amount,
        // Recorded but never summed anywhere — see the note on
        // UtilityBill.previousDebt in the Prisma schema.
        taxAmount: input.taxAmount ?? null,
        previousDebt: input.previousDebt ?? null,
        currency: household.currency,
        paymentDate: input.paymentDate,
        invoiceNumber: cleanOptional(input.invoiceNumber),
        notes: cleanOptional(input.notes),
        inputMethod: input.inputMethod,
        readings: { create: readings },
      },
    });
    return { ok: true, data: { id: bill.id } };
  } catch (error) {
    if (isDuplicatePeriodError(error)) {
      return { ok: false, error: "utilities.bill.duplicatePeriodError" };
    }
    throw error;
  }
}

export async function updateUtilityBill(
  billId: string,
  _prevState: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const user = await requireCurrentUser();
  const parsed = utilityBillSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const existing = await prisma.utilityBill.findFirst({
    where: { id: billId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  const account = await prisma.utilityAccount.findFirst({
    where: { id: input.accountId, householdId: user.householdId },
  });
  if (!account) {
    return { ok: false, error: "validation.invalidToken" };
  }

  let readings: ReadingsResult["readings"] = [];
  if (account.tracksReadings) {
    const result = buildReadings(input);
    if (!result.ok) {
      return { ok: false, error: "validation.required", fieldErrors: result.fieldErrors };
    }
    readings = result.readings;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.utilityBill.update({
        where: { id: billId },
        data: {
          accountId: input.accountId,
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          amount: input.amount,
          taxAmount: input.taxAmount ?? null,
          previousDebt: input.previousDebt ?? null,
          paymentDate: input.paymentDate,
          invoiceNumber: cleanOptional(input.invoiceNumber),
          notes: cleanOptional(input.notes),
        },
      });
      await tx.utilityBillReading.deleteMany({ where: { billId } });
      if (readings.length > 0) {
        await tx.utilityBillReading.createMany({
          data: readings.map((r) => ({ ...r, billId })),
        });
      }
    });
    return { ok: true, data: { id: billId } };
  } catch (error) {
    if (isDuplicatePeriodError(error)) {
      return { ok: false, error: "utilities.bill.duplicatePeriodError" };
    }
    throw error;
  }
}

export async function deleteUtilityBill(billId: string): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const existing = await prisma.utilityBill.findFirst({
    where: { id: billId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  await prisma.utilityBill.delete({ where: { id: billId } });
  return { ok: true, data: undefined };
}

/** Marks a bill paid today, or reopens it — a one-click affordance next to
 * the derived status badge rather than a full edit-form round trip. */
export async function toggleBillPaid(billId: string, markPaid: boolean): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const existing = await prisma.utilityBill.findFirst({
    where: { id: billId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  await prisma.utilityBill.update({
    where: { id: billId },
    data: { paymentDate: markPaid ? new Date() : null },
  });
  return { ok: true, data: undefined };
}
