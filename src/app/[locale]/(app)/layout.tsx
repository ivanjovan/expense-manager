import { getTranslations, getLocale } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { redirect, Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { LocaleSwitcher } from "@/shared/components/locale-switcher";
import { LogOut } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, t, locale] = await Promise.all([
    auth(),
    getTranslations("nav"),
    getLocale(),
  ]);

  // Defense in depth: proxy.ts already redirects unauthenticated visitors,
  // but a Server Component must never assume that ran — see the "Execution
  // order" warning in Next's proxy.js docs.
  if (!session) {
    redirect({ href: "/login", locale });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/dashboard" className="hover:text-primary">
              {t("dashboard")}
            </Link>
            <span className="text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <Link href="/vehicles" className="hover:text-primary">
              {t("vehicles")}
            </Link>
            <span className="text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <Link href="/utilities" className="hover:text-primary">
              {t("utilities")}
            </Link>
            <span className="text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <Link href="/settings/household" className="hover:text-primary">
              {t("settings")}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: `/${locale}/login` });
              }}
            >
              <Button type="submit" variant="ghost" size="sm" aria-label={t("signOut")}>
                <LogOut className="size-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
