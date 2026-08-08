import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { verifyPassword, dummyPasswordCompare } from "@/shared/lib/passwords";
import { authConfig } from "./auth.config";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/** Thrown instead of the generic CredentialsSignin so the login form can
 *  show a distinct message. See SRS §6.3 — the account-lock signal is an
 *  accepted, deliberate exception to "don't reveal whether an email exists". */
export class AccountLockedError extends CredentialsSignin {
  constructor() {
    super();
    this.code = "account_locked";
  }
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * The database-backed half of the config — see auth.config.ts for why the
 * two are split. Only server code imports this module; `proxy.ts` builds a
 * second, adapter-free NextAuth instance from the shared config.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        // Deliberately generic: an unknown email and a wrong password both
        // fall through to the same "invalid credentials" outcome below.
        //
        // The dummy compare keeps the two indistinguishable by *timing* too.
        // Returning early here was measurably faster than the cost-12 hash a
        // real account pays for, which turns the response time into an
        // account-existence oracle — the exact disclosure the generic
        // outcome above exists to prevent.
        if (!user) {
          await dummyPasswordCompare(password);
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new AccountLockedError();
        }

        const valid = await verifyPassword(password, user.passwordHash);

        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          const locked = attempts >= MAX_FAILED_ATTEMPTS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: locked ? 0 : attempts,
              lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS) : null,
            },
          });
          if (locked) throw new AccountLockedError();
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          householdId: user.householdId,
          role: user.role,
          locale: user.locale,
        };
      },
    }),
  ],
});
