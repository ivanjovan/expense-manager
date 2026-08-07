import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { prisma } from "@/shared/lib/prisma";
import { verifyPassword } from "@/shared/lib/passwords";

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days, sliding
  pages: {
    // Locale-prefixed sign-in pages can't be expressed as a single static
    // path here; route protection and redirects are handled in proxy.ts
    // instead, which knows the current locale.
  },
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
        if (!user) return null;

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
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id!;
        token.householdId = user.householdId;
        token.role = user.role;
        token.locale = user.locale;
      }
      // Allows `update()` from the client (e.g. after a locale change) to
      // refresh the token without forcing a full re-login.
      if (trigger === "update" && session?.locale) {
        token.locale = session.locale;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.householdId = token.householdId;
      session.user.role = token.role;
      session.user.locale = token.locale;
      return session;
    },
  },
});
