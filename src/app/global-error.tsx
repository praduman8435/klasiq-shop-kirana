"use client";

import { useEffect } from "react";

/**
 * Catches an error in the ROOT layout itself (rare — src/app/layout.tsx
 * is deliberately minimal, fonts + Toaster only) — the one case
 * `src/app/(site)/error.tsx`/`src/app/admin/error.tsx` cannot catch,
 * since an error boundary never covers the layout it's nested inside.
 * Must render its own complete `<html>`/`<body>` (it replaces the root
 * layout when active) and, per Next's own documented warning, cannot
 * rely on the app's global stylesheet actually being loaded — inline
 * styles only, deliberately not Tailwind classes, so this page still
 * renders correctly even in the exact failure mode it exists to handle.
 *
 * Same rule as the other two error boundaries: never render
 * `error.message`, only the safe `error.digest` correlation id.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global error boundary", { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          color: "#1a1a1a",
          backgroundColor: "#fdfbf7",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: "#6b6b6b", maxWidth: "28rem", margin: 0 }}>
          The application hit an unexpected error. Please try again shortly.
        </p>
        {error.digest && (
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              color: "#6b6b6b",
              backgroundColor: "#f0ece3",
              borderRadius: "9999px",
              padding: "0.375rem 1rem",
            }}
          >
            Reference: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: "0.5rem",
            borderRadius: "9999px",
            border: "none",
            backgroundColor: "#552620",
            color: "#fdfbf7",
            padding: "0.625rem 1.5rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
