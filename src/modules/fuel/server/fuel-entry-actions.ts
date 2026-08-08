"use server";

import { prisma } from "@/shared/lib/prisma";
import { requireCurrentUser } from "@/shared/lib/session";
import { ActionResult, fieldErrorsFromZod } from "@/shared/types/action-result";
import { fuelEntrySchema } from "../schemas/fuel-entry";
import { hasFuelValueDiscrepancy } from "../domain/derivation";

function cleanOptional(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value.trim() : null;
}

async function requireHouseholdCurrency(householdId: string) {
  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { currency: true },
  });
  return household.currency;
}

export async function createFuelEntry(
  _prevState: ActionResult<{ id: string; warning?: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string; warning?: string }>> {
  const user = await requireCurrentUser();
  const parsed = fuelEntrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, householdId: user.householdId },
  });
  if (!vehicle) {
    return { ok: false, error: "validation.invalidToken" };
  }

  const currency = await requireHouseholdCurrency(user.householdId);

  // Non-blocking per SRS §10.3 — pumps round, the receipt is the source
  // of truth. Only surfaced when the user actually entered all three
  // values themselves (derivedField "NONE"); a computed field can't
  // disagree with the inputs it was computed from.
  const warning =
    input.derivedField === "NONE" && hasFuelValueDiscrepancy(input)
      ? "fuel.entry.valueDiscrepancyWarning"
      : undefined;

  const entry = await prisma.fuelEntry.create({
    data: {
      householdId: user.householdId,
      vehicleId: input.vehicleId,
      createdByUserId: user.id,
      date: input.date,
      odometer: input.odometer,
      fuelPrice: input.fuelPrice,
      liters: input.liters,
      totalPaid: input.totalPaid,
      currency,
      isFullTank: input.isFullTank,
      missedEntries: input.missedEntries,
      derivedField: input.derivedField,
      inputMethod: input.inputMethod,
      station: cleanOptional(input.station),
      notes: cleanOptional(input.notes),
    },
  });

  return { ok: true, data: { id: entry.id, warning } };
}

export async function updateFuelEntry(
  entryId: string,
  _prevState: ActionResult<{ id: string; warning?: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string; warning?: string }>> {
  const user = await requireCurrentUser();
  const parsed = fuelEntrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const existing = await prisma.fuelEntry.findFirst({
    where: { id: entryId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, householdId: user.householdId },
  });
  if (!vehicle) {
    return { ok: false, error: "validation.invalidToken" };
  }

  const warning =
    input.derivedField === "NONE" && hasFuelValueDiscrepancy(input)
      ? "fuel.entry.valueDiscrepancyWarning"
      : undefined;

  await prisma.fuelEntry.update({
    where: { id: entryId },
    data: {
      vehicleId: input.vehicleId,
      date: input.date,
      odometer: input.odometer,
      fuelPrice: input.fuelPrice,
      liters: input.liters,
      totalPaid: input.totalPaid,
      isFullTank: input.isFullTank,
      missedEntries: input.missedEntries,
      derivedField: input.derivedField,
      station: cleanOptional(input.station),
      notes: cleanOptional(input.notes),
    },
  });

  return { ok: true, data: { id: entryId, warning } };
}

export async function deleteFuelEntry(entryId: string): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const existing = await prisma.fuelEntry.findFirst({
    where: { id: entryId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  await prisma.fuelEntry.delete({ where: { id: entryId } });
  return { ok: true, data: undefined };
}
