"use client";

import * as React from "react";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";

type Theme = "light" | "dark" | "system";

const THEME_CHANGE_EVENT = "expense-manager:theme-change";

function readTheme(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "dark" || stored === "light" ? stored : "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme !== "system") {
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  } else {
    localStorage.removeItem("theme");
  }
  // `storage` only fires in *other* tabs; dispatch our own so this tab's
  // toggle re-renders too — see subscribe() below.
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

function getServerSnapshot(): Theme {
  return "system";
}

export function ThemeToggle() {
  const t = useTranslations("theme");
  // useSyncExternalStore (rather than state + effect) reads localStorage
  // without a hydration mismatch and without tripping the
  // set-state-in-effect lint rule for a read that's genuinely external.
  const theme = React.useSyncExternalStore(subscribe, readTheme, getServerSnapshot);

  function cycle() {
    const order: Theme[] = ["light", "dark", "system"];
    applyTheme(order[(order.indexOf(theme) + 1) % order.length]);
  }

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : MonitorSmartphone;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={cycle}
      aria-label={t("label")}
      title={t(theme)}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
}
