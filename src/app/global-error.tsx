"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/errors/report";

/**
 * Last-resort boundary — catches errors in the ROOT layout itself (where the normal
 * error.tsx can't help). Must render its own <html>/<body>. Kept minimal + inline-
 * styled so it works even if the app's CSS failed to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({ error, source: "boundary", context: "global-error" });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0b1220", color: "#e5e7eb", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 460, margin: "18vh auto", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden>
            ⚠
          </div>
          <h1 style={{ fontSize: 20, margin: "16px 0 8px" }}>InCommand hit a problem</h1>
          <p style={{ fontSize: 14, color: "#9ca3af", margin: "0 0 20px" }}>
            The app couldn&apos;t recover this view. Reloading usually fixes it — your data is saved.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#0d9488",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 16 }}>Reference: {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
