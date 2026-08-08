import { getTranslations, getLocale } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { redirect, Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { LocaleSwitcher } from "@/shared/components/locale-switcher";
import { AppNavDesktop, AppNavMobile } from "@/shared/components/app-nav";
import { cn } from "@/shared/lib/cn";
import { LogOut } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, t, tApp, locale] = await Promise.all([
    auth(),
    getTranslations("nav"),
    getTranslations("app"),
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
      <header className="sticky top-0 z-40 border-b border-glass-border bg-glass backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4">
          {/* On phones the destinations live in the bottom bar, so the
              header carries the app name instead of competing for the row. */}
          <Link href="/dashboard" className="font-semibold tracking-tight md:hidden">
            {tApp("name")}
          </Link>
          <AppNavDesktop />
          <div className="flex shrink-0 items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: `/${locale}/login` });
              }}
            >
              <Button type="submit" variant="ghost" size="icon" aria-label={t("signOut")}>
                <LogOut className="size-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8",
          // Clears the fixed bottom tab bar (and the home indicator below
          // it) so the last control on a page is never unreachable.
          "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8"
        )}
      >
        {children}
      </main>
      <AppNavMobile />
    </div>
  );
}
