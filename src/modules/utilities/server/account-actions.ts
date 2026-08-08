"use server";

import { prisma } from "@/shared/lib/prisma";
import { currentUserOrError } from "@/shared/lib/action-guard";
import { ActionResult, fieldErrorsFromZod } from "@/shared/types/action-result";
import { utilityAccountSchema } from "../schemas/utility-account";

function cleanOptional(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value.trim() : null;
}

export async function createUtilityAccount(
  _prevState: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const session = await currentUserOrError();
  if (!session.ok) return session;
  const user = session.user;
  const parsed = utilityAccountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const account = await prisma.utilityAccount.create({
    data: {
      householdId: user.householdId,
      utilityType: "ELECTRICITY",
      name: input.name,
      provider: cleanOptional(input.provider),
      accountNumber: cleanOptional(input.accountNumber),
      meterNumber: cleanOptional(input.meterNumber),
      tracksReadings: true,
      unit: "KWH",
    },
  });

  return { ok: true, data: { id: account.id } };
}

export async function updateUtilityAccount(
  accountId: string,
  _prevState: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const session = await currentUserOrError();
  if (!session.ok) return session;
  const user = session.user;
  const parsed = utilityAccountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const existing = await prisma.utilityAccount.findFirst({
    where: { id: accountId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "common.notFound" };
  }

  await prisma.utilityAccount.update({
    where: { id: accountId },
    data: {
      name: input.name,
      provider: cleanOptional(input.provider),
      accountNumber: cleanOptional(input.accountNumber),
      meterNumber: cleanOptional(input.meterNumber),
    },
  });

  return { ok: true, data: { id: accountId } };
}

export async function archiveUtilityAccount(accountId: string): Promise<ActionResult> {
  const session = await currentUserOrError();
  if (!session.ok) return session;
  const user = session.user;
  const existing = await prisma.utilityAccount.findFirst({
    where: { id: accountId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "common.notFound" };
  }
  await prisma.utilityAccount.update({
    where: { id: accountId },
    data: { archivedAt: new Date() },
  });
  return { ok: true, data: undefined };
}

export async function unarchiveUtilityAccount(accountId: string): Promise<ActionResult> {
  const session = await currentUserOrError();
  if (!session.ok) return session;
  const user = session.user;
  const existing = await prisma.utilityAccount.findFirst({
    where: { id: accountId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "common.notFound" };
  }
  await prisma.utilityAccount.update({
    where: { id: accountId },
    data: { archivedAt: null },
  });
  return { ok: true, data: undefined };
}

/** Hard delete only when the account has zero bills — mirrors
 * deleteVehicle in the fuel module (SRS §10.1's rule, applied here too). */
export async function deleteUtilityAccount(accountId: string): Promise<ActionResult> {
  const session = await currentUserOrError();
  if (!session.ok) return session;
  const user = session.user;
  const existing = await prisma.utilityAccount.findFirst({
    where: { id: accountId, householdId: user.householdId },
    include: { _count: { select: { bills: true } } },
  });
  if (!existing) {
    return { ok: false, error: "common.notFound" };
  }
  if (existing._count.bills > 0) {
    return { ok: false, error: "utilities.account.deleteBlocked" };
  }
  await prisma.utilityAccount.delete({ where: { id: accountId } });
  return { ok: true, data: undefined };
}
