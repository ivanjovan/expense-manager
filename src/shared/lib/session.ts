import { auth } from "@/auth";
import { prisma } from "./prisma";
import type { User } from "@/generated/prisma/client";

export class UnauthenticatedError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Re-verifies the session's user against the database rather than trusting
 * the JWT alone. JWT claims (role, household membership) are stale until
 * the token refreshes, so a role change or member removal must still be
 * caught here. Every Server Action and household-scoped query goes through
 * this rather than reading `session.user` directly. See SRS §6.4.
 */
export async function requireCurrentUser(): Promise<User> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthenticatedError("Not signed in.");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) {
    throw new UnauthenticatedError("Session user no longer exists.");
  }
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await requireCurrentUser();
  if (user.role !== "OWNER") {
    throw new ForbiddenError("Owner role required.");
  }
  return user;
}
