import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { authConfig } from "@/auth.config";

// Next.js 16 renamed the `middleware` file convention to `proxy` — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
//
// This builds its own NextAuth instance from the adapter-free shared config
// rather than importing `auth` from "@/auth". With `strategy: "jwt"` the
// check below only verifies a signed cookie, so pulling in the Prisma
// adapter — and with it PrismaClient, the pg driver and env validation — put
// the entire server data layer on the request path of every navigation, for
// no benefit. Next's own proxy docs are explicit that this file "is meant to
// be invoked separately of your render code".
const { auth } = NextAuth(authConfig);

const intlMiddleware = createMiddleware(routing);

const PUBLIC_SEGMENTS = ["login", "register", "invite"];

function isPublicSegment(pathname: string): boolean {
  const [, second] = pathname.split("/").filter(Boolean);
  return second !== undefined && PUBLIC_SEGMENTS.includes(second);
}

export default auth((req) => {
  const intlResponse = intlMiddleware(req);

  // A redirect here means the request was missing its locale prefix
  // (routing.localePrefix is "always"); let it go and re-run everything,
  // including this auth check, once the prefixed request comes back.
  if (intlResponse.status === 307 || intlResponse.status === 308) {
    return intlResponse;
  }

  const { pathname } = req.nextUrl;

  if (!isPublicSegment(pathname) && !req.auth) {
    const locale = pathname.split("/").filter(Boolean)[0] ?? routing.defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlResponse;
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
