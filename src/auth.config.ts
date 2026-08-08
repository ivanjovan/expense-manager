import type { NextAuthConfig } from "next-auth";

/**
 * The half of the Auth.js configuration that carries no database.
 *
 * `proxy.ts` runs on every matched request, and Next's own docs warn that
 * proxy code "is meant to be invoked separately of your render code and in
 * optimized cases deployed to your CDN" — so it must not drag the app's
 * server graph along with it. Importing the full `auth.ts` did exactly that:
 * `PrismaAdapter(prisma)` pulled in PrismaClient, the pg driver adapter and
 * the env validation, on every navigation, purely so the proxy could decode
 * a cookie.
 *
 * With `strategy: "jwt"` the proxy never needs the adapter or the provider —
 * it only verifies a signed token and runs these callbacks. The adapter and
 * the Credentials provider therefore live in `auth.ts`, which only server
 * code imports. Both halves share this file, so the token and session shapes
 * cannot drift apart.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days, sliding
  pages: {
    // Locale-prefixed sign-in pages can't be expressed as a single static
    // path here; route protection and redirects are handled in proxy.ts
    // instead, which knows the current locale.
  },
  // Populated in auth.ts. The proxy verifies existing tokens rather than
  // issuing them, so it needs no provider of its own.
  providers: [],
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
} satisfies NextAuthConfig;

export default authConfig;
