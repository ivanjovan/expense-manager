"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Download } from "lucide-react";

/**
 * Triggers a file download from GET /api/export.
 *
 * Fetched rather than a plain <a href> so a failure surfaces as a message
 * instead of the browser navigating to a JSON error body — the 403 for a
 * non-owner requesting the full export is a real, reachable case.
 */

type ExportScope = "household" | "vehicle" | "account";

interface ExportButtonProps {
  scope: ExportScope;
  /** Vehicle or account id. Omitted for the household scope. */
  id?: string;
  labelKey: "fullButton" | "vehicleButton" | "accountButton";
  variant?: "default" | "outline";
  size?: "default" | "sm";
  className?: string;
}

/** The server sends the filename in Content-Disposition; this pulls it back
 * out so the saved file keeps its date stamp and the household's own name
 * rather than becoming "route.xlsx". */
function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // Fall through to the ASCII form below.
    }
  }
  const ascii = header.match(/filename="([^"]+)"/i);
  return ascii ? ascii[1] : fallback;
}

export function ExportButton({ scope, id, labelKey, variant = "outline", size = "sm", className }: ExportButtonProps) {
  const t = useTranslations("export");
  const locale = useLocale();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<"forbidden" | "failed" | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      // Sent explicitly: /api/export sits outside the localized route
      // segment, so the server cannot infer the active language.
      const params = new URLSearchParams({ scope, locale });
      if (id) params.set("id", id);
      const response = await fetch(`/api/export?${params}`);

      if (!response.ok) {
        setError(response.status === 403 ? "forbidden" : "failed");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFrom(
        response.headers.get("Content-Disposition"),
        "export.xlsx"
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={busy}
        className={className}
      >
        <Download className="size-4" aria-hidden="true" />
        {busy ? t("preparing") : t(labelKey)}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error === "forbidden" ? t("ownerOnly") : t("failed")}
        </p>
      )}
    </div>
  );
}
