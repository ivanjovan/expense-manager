"use server";

import { prisma } from "@/shared/lib/prisma";
import { hashPassword } from "@/shared/lib/passwords";
import { generateToken, hashToken, INVITATION_TTL_MS } from "@/shared/lib/tokens";
import { requireOwner } from "@/shared/lib/session";
import { ActionResult, fieldErrorsFromZod } from "@/shared/types/action-result";
import {
  registerHouseholdSchema,
  inviteMemberSchema,
  acceptInviteSchema,
} from "../schemas/auth";
import { isRegistrationOpen } from "./queries";

export async function registerHousehold(
  input: unknown
): Promise<ActionResult<{ userId: string }>> {
  const open = await isRegistrationOpen();
  if (!open) {
    return { ok: false, error: "auth.register.closedBody" };
  }

  const parsed = registerHouseholdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { householdName, name, email, password, currency } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return {
      ok: false,
      error: "validation.emailInUse",
      fieldErrors: { email: "validation.emailInUse" },
    };
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: { name: householdName, currency },
    });
    return tx.user.create({
      data: {
        email: normalizedEmail,
        name,
        passwordHash,
        role: "OWNER",
        householdId: household.id,
      },
    });
  });

  return { ok: true, data: { userId: user.id } };
}

export async function inviteMember(
  input: unknown
): Promise<ActionResult<{ token: string; email: string }>> {
  const owner = await requireOwner();

  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { email, role } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingUser) {
    return {
      ok: false,
      error: "validation.emailInUse",
      fieldErrors: { email: "validation.emailInUse" },
    };
  }

  const { token, tokenHash } = generateToken();
  await prisma.invitation.create({
    data: {
      householdId: owner.householdId,
      email: normalizedEmail,
      tokenHash,
      role,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      createdByUserId: owner.id,
    },
  });

  // SRS §6.2: if SMTP isn't configured, the owner shares the link
  // manually — the token is returned here so the UI can display it. The
  // caller is responsible for refreshing its own view (router.refresh()),
  // since revalidatePath needs the as-rendered (locale-prefixed) path and
  // next-intl's usePathname() deliberately strips that prefix.
  return { ok: true, data: { token, email: normalizedEmail } };
}

export async function acceptInvite(
  input: unknown
): Promise<ActionResult<{ userId: string; email: string }>> {
  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation.required",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { token, name, password } = parsed.data;
  const tokenHash = hashToken(token);

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
  });
  if (!invitation || invitation.acceptedAt) {
    return { ok: false, error: "validation.invalidToken" };
  }
  if (invitation.expiresAt < new Date()) {
    return { ok: false, error: "auth.invite.expiredBody" };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.email },
  });
  if (existingUser) {
    return {
      ok: false,
      error: "validation.emailInUse",
      fieldErrors: { email: "validation.emailInUse" },
    };
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: invitation.email,
        name,
        passwordHash,
        role: invitation.role,
        householdId: invitation.householdId,
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return created;
  });

  return { ok: true, data: { userId: user.id, email: user.email } };
}
