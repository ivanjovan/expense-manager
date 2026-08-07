import { getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";

export default async function RootPage() {
  const [session, locale] = await Promise.all([auth(), getLocale()]);
  redirect({ href: session ? "/dashboard" : "/login", locale });
}
