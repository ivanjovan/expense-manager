"use client";

/**
 * Last-resort boundary for a failure in the root layout itself, which
 * `[locale]/error.tsx` sits below and therefore cannot catch.
 *
 * Deliberately dependency-free. This file replaces the root layout when it
 * renders, so global styles, fonts and `NextIntlClientProvider` are all
 * absent — there is no `t()` to call and no Tailwind class that would
 * resolve. Hence inline styles and untranslated English: the alternative is
 * an unstyled stack trace. It is reachable only when the shell is already
 * broken, so the realistic audience is whoever is on call, not the household.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1.25rem", opacity: 0.75, lineHeight: 1.5 }}>
            The application failed to start up. Trying again may fix it; if it
            doesn&apos;t, the error reference below identifies this failure in
            the server logs.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: "inherit",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.25rem", fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.6 }}>
              {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
