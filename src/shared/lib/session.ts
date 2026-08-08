import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "./prisma";
import { UnauthenticatedError, ForbiddenError } from "./auth-errors";
import type { User } from "@/generated/prisma/client";

// Re-exported so existing importers keep working; they are declared in
// auth-errors.ts so a module that only needs to recognise one doesn't pull
// Auth.js and Prisma in with it.
export { UnauthenticatedError, ForbiddenError };

/**
 * Re-verifies the session's user against the database rather than trusting
 * the JWT alone. JWT claims (role, household membership) are stale until
 * the token refreshes, so a role change or member removal must still be
 * caught here. Every Server Action and household-scoped query goes through
 * this rather than reading `session.user` directly. See SRS §6.4.
 *
 * Wrapped in React's `cache()` so that verification happens once per
 * *request*, not once per call site. Nothing about the guarantee changes —
 * the cache lives and dies with the request — but the dashboard alone calls
 * this from three independent queries, and without memoization each one paid
 * for its own JWT decrypt plus `user.findUnique`.
 */
export const requireCurrentUser = cache(async function requireCurrentUser(): Promise<User> {
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
});

export async function requireOwner(): Promise<User> {
  const user = await requireCurrentUser();
  if (user.role !== "OWNER") {
    throw new ForbiddenError("Owner role required.");
  }
  return user;
}
