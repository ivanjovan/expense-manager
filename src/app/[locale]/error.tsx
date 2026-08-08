"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/shared/components/ui/card";

/**
 * Segment-level error boundary for everything under `/[locale]`.
 *
 * Without one, any throw on the server — most realistically a lapsed session
 * reaching `requireCurrentUser()` in a Server Component, since sessions last
 * 30 days — took the user to Next's raw error screen. It sits inside the
 * locale layout, so `NextIntlClientProvider` is above it and the copy can be
 * translated.
 *
 * `retry` rather than `reset`: Next 16.3 stabilised `retry`, which re-fetches
 * the segment as well as re-rendering it. `reset` only clears the boundary's
 * state, which for a failed server render just reproduces the same error.
 */
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("common");

  React.useEffect(() => {
    // The digest is the only handle on the server-side stack in production,
    // where the message itself is redacted.
    console.error("Unhandled error", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("errorTitle")}</CardTitle>
          <CardDescription>{t("errorBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={() => retry()}>{t("tryAgain")}</Button>
          {error.digest && (
            <p className="text-center font-mono text-xs text-muted-foreground">
              {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
