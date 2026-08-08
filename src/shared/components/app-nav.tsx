"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/shared/lib/cn";
import { LayoutDashboard, Car, Zap, Settings, type LucideIcon } from "lucide-react";

/**
 * One nav definition, two presentations: a row in the header on desktop and
 * a bottom tab bar on phones.
 *
 * The bottom bar is the change that makes this feel like an app rather than
 * a website on a small screen — the destinations sit under the thumb instead
 * of in the top-left corner, which is the hardest place to reach one-handed.
 * It also fixes the actual bug: four links plus separators plus three
 * controls could never fit on one 375px row, so the header overflowed.
 */

interface NavItem {
  href: string;
  labelKey: "dashboard" | "vehicles" | "utilities" | "settings";
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/vehicles", labelKey: "vehicles", icon: Car },
  { href: "/utilities", labelKey: "utilities", icon: Zap },
  { href: "/settings/household", labelKey: "settings", icon: Settings },
];

function useIsActive() {
  const pathname = usePathname();
  // Prefix match so a nested route (/vehicles/123/fuel/new) keeps its tab lit.
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Header nav — desktop only. */
export function AppNavDesktop() {
  const t = useTranslations("nav");
  const isActive = useIsActive();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map(({ href, labelKey }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
            isActive(href)
              ? "bg-glass-strong text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}

/** Bottom tab bar — phones only. */
export function AppNavMobile() {
  const t = useTranslations("nav");
  const isActive = useIsActive();

  return (
    <nav
      aria-label={t("primary")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "border-t border-glass-border bg-glass backdrop-blur-xl",
        // Clears the iPhone home indicator. Without this the last row of
        // tab labels sits underneath it and is unreadable.
        "pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <ul className="flex items-stretch justify-around">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // min-h-14 keeps every tab a comfortable thumb target.
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="text-[11px] font-medium leading-none">{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
