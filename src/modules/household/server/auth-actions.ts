"use server";

/**
 * Thin, form-facing wrappers around the pure mutations in actions.ts.
 * These know about FormData, the current locale (for a locale-prefixed
 * redirect), and about establishing a session afterwards — concerns that
 * don't belong in the reusable, easily-unit-tested mutations themselves.
 */
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { signIn, AccountLockedError } from "@/auth";
import { hit } from "@/shared/lib/rate-limit";
import { ActionResult, fieldErrorsFromZod } from "@/shared/types/action-result";
import { loginSchema } from "../schemas/auth";
import { registerHousehold, acceptInvite } from "./actions";

function formDataToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

/**
 * Complements the per-account lockout in auth.ts, which caps guesses against
 * one email but does nothing to slow an attacker sweeping many. Keyed by
 * origin instead, so the two together bound both shapes of guessing.
 */
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  // x-forwarded-for is a client-settable header anywhere it isn't rewritten
  // by a trusted proxy. Behind Vercel it is, which is the deployment this
  // targets; the fallback simply degrades to one shared bucket.
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headerList.get("x-real-ip") || "unknown";
}

export async function loginAction(
  locale: string,
  _prevState: ActionResult<undefined> | undefined,
  formData: FormData
): Promise<ActionResult<undefined>> {
  const parsed = loginSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const budget = hit(`login:${await requestOrigin()}`, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
  if (!budget.allowed) {
    return { ok: false, error: "auth.login.tooManyAttempts" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: `/${locale}/dashboard`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error instanceof AccountLockedError) {
        return { ok: false, error: "auth.login.accountLocked" };
      }
      return { ok: false, error: "auth.login.invalidCredentials" };
    }
    // NEXT_REDIRECT is thrown on success — let it propagate.
    throw error;
  }

  return { ok: true, data: undefined };
}

export async function registerAction(
  locale: string,
  _prevState: ActionResult<undefined> | undefined,
  formData: FormData
): Promise<ActionResult<undefined>> {
  const input = formDataToObject(formData);
  const result = await registerHousehold(input);
  if (!result.ok) return result;

  try {
    await signIn("credentials", {
      email: input.email as string,
      password: input.password as string,
      redirectTo: `/${locale}/dashboard`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // The account was created but auto-sign-in failed for some reason —
      // send them to log in manually rather than losing the error.
      return { ok: false, error: "auth.login.invalidCredentials" };
    }
    throw error;
  }

  return { ok: true, data: undefined };
}

export async function acceptInviteAction(
  locale: string,
  _prevState: ActionResult<undefined> | undefined,
  formData: FormData
): Promise<ActionResult<undefined>> {
  const input = formDataToObject(formData);
  const result = await acceptInvite(input);
  if (!result.ok) return result;

  try {
    await signIn("credentials", {
      email: result.data.email,
      password: input.password as string,
      redirectTo: `/${locale}/dashboard`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "auth.login.invalidCredentials" };
    }
    throw error;
  }

  return { ok: true, data: undefined };
}
