"use server";

import { prisma } from "@/shared/lib/prisma";
import { requireCurrentUser } from "@/shared/lib/session";
import { ActionResult, fieldErrorsFromZod } from "@/shared/types/action-result";
import { vehicleSchema } from "../schemas/vehicle";

function cleanOptional(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value.trim() : null;
}

export async function createVehicle(
  _prevState: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const user = await requireCurrentUser();
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const vehicle = await prisma.vehicle.create({
    data: {
      householdId: user.householdId,
      name: input.name,
      manufacturer: cleanOptional(input.manufacturer),
      model: cleanOptional(input.model),
      fuelType: input.fuelType,
      licensePlate: cleanOptional(input.licensePlate),
      initialOdometer: input.initialOdometer,
      notes: cleanOptional(input.notes),
    },
  });

  return { ok: true, data: { id: vehicle.id } };
}

export async function updateVehicle(
  vehicleId: string,
  _prevState: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const user = await requireCurrentUser();
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input = parsed.data;

  const existing = await prisma.vehicle.findFirst({
    where: { id: vehicleId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      name: input.name,
      manufacturer: cleanOptional(input.manufacturer),
      model: cleanOptional(input.model),
      fuelType: input.fuelType,
      licensePlate: cleanOptional(input.licensePlate),
      initialOdometer: input.initialOdometer,
      notes: cleanOptional(input.notes),
    },
  });

  return { ok: true, data: { id: vehicleId } };
}

export async function archiveVehicle(vehicleId: string): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const existing = await prisma.vehicle.findFirst({
    where: { id: vehicleId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { archivedAt: new Date() },
  });
  return { ok: true, data: undefined };
}

export async function unarchiveVehicle(vehicleId: string): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const existing = await prisma.vehicle.findFirst({
    where: { id: vehicleId, householdId: user.householdId },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { archivedAt: null },
  });
  return { ok: true, data: undefined };
}

/** Hard delete only when the vehicle has zero fuel entries — SRS §10.1.
 * A vehicle with history is archived instead (see archiveVehicle above);
 * a confirmed "delete vehicle and all N entries" flow is a later addition. */
export async function deleteVehicle(vehicleId: string): Promise<ActionResult> {
  const user = await requireCurrentUser();
  const existing = await prisma.vehicle.findFirst({
    where: { id: vehicleId, householdId: user.householdId },
    include: { _count: { select: { fuelEntries: true } } },
  });
  if (!existing) {
    return { ok: false, error: "validation.invalidToken" };
  }
  if (existing._count.fuelEntries > 0) {
    return { ok: false, error: "fuel.vehicle.deleteBlocked" };
  }
  await prisma.vehicle.delete({ where: { id: vehicleId } });
  return { ok: true, data: undefined };
}
