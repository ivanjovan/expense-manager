import "server-only";
import { requireCurrentUser, requireOwner } from "./session";
import { UnauthenticatedError, ForbiddenError } from "./auth-errors";
import type { User } from "@/generated/prisma/client";

/**
 * Session checks in the shape Server Actions actually want.
 *
 * `requireCurrentUser()` throws, which is right for Server Components and
 * Route Handlers — a page can't render and a handler wants to map the
 * failure to a status code. Inside a Server Action it is wrong: the throw
 * crosses the client boundary as an unhandled error, so a session that
 * lapsed while a form sat open (they last 30 days, so this happens) replaced
 * a half-filled form with an error screen and lost the user's typing.
 *
 * These return the failure as an ordinary `ActionResult` instead, which
 * every form already knows how to render — the `{ ok: false }` branch has no
 * `data`, so it satisfies `ActionResult<T>` for any T and needs no cast at
 * the call site. Error values are i18n message keys per SRS §16.
 */

type UserOrError =
  | { ok: true; user: User }
  | { ok: false; error: string };

function toFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof UnauthenticatedError) {
    return { ok: false, error: "common.sessionExpired" };
  }
  if (error instanceof ForbiddenError) {
    return { ok: false, error: "common.forbidden" };
  }
  // Anything else — including the NEXT_REDIRECT signal — is not ours to
  // swallow.
  throw error;
}

export async function currentUserOrError(): Promise<UserOrError> {
  try {
    return { ok: true, user: await requireCurrentUser() };
  } catch (error) {
    return toFailure(error);
  }
}

export async function ownerOrError(): Promise<UserOrError> {
  try {
    return { ok: true, user: await requireOwner() };
  } catch (error) {
    return toFailure(error);
  }
}
