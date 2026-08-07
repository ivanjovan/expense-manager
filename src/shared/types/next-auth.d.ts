import type { DefaultSession } from "next-auth";
import type { Role, Locale } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      householdId: string;
      role: Role;
      locale: Locale;
    } & DefaultSession["user"];
  }

  interface User {
    householdId: string;
    role: Role;
    locale: Locale;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    householdId: string;
    role: Role;
    locale: Locale;
  }
}
