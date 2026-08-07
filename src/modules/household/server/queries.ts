import "server-only";
import { prisma } from "@/shared/lib/prisma";
import { hashToken } from "@/shared/lib/tokens";
import { requireCurrentUser } from "@/shared/lib/session";
import { env } from "@/shared/lib/env";

export async function isRegistrationOpen(): Promise<boolean> {
  if (env.ALLOW_PUBLIC_REGISTRATION) return true;
  const userCount = await prisma.user.count();
  return userCount === 0;
}

export async function getHouseholdMembers() {
  const user = await requireCurrentUser();
  return prisma.user.findMany({
    where: { householdId: user.householdId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      locale: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export async function getPendingInvitations() {
  const user = await requireCurrentUser();
  return prisma.invitation.findMany({
    where: { householdId: user.householdId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHousehold() {
  const user = await requireCurrentUser();
  return prisma.household.findUniqueOrThrow({
    where: { id: user.householdId },
  });
}

/** Unauthenticated lookup — used by the invite-acceptance page, which by
 * definition renders before the visitor has an account. */
export async function getInvitationByToken(token: string) {
  const tokenHash = hashToken(token);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { household: { select: { name: true } } },
  });
  if (!invitation || invitation.acceptedAt) return null;
  return invitation;
}
