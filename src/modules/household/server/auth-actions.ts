"use server";

/**
 * Thin, form-facing wrappers around the pure mutations in actions.ts.
 * These know about FormData, the current locale (for a locale-prefixed
 * redirect), and about establishing a session afterwards — concerns that
 * don't belong in the reusable, easily-unit-tested mutations themselves.
 */
import { AuthError } from "next-auth";
import { signIn, AccountLockedError } from "@/auth";
import { ActionResult, fieldErrorsFromZod } from "@/shared/types/action-result";
import { loginSchema } from "../schemas/auth";
import { registerHousehold, acceptInvite } from "./actions";

function formDataToObject(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
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
