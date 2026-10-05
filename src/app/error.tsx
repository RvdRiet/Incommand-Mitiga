"use client";

import Link from "next/link";
import { useEffect } from "react";

import { reportClientError } from "@/lib/errors/report";

/**
 * Route-segment error boundary (Next.js App Router). Catches errors thrown while
 * rendering a route so the user gets a recovery screen — with the app shell intact —
 * instead of a blank page, and the error is reported to /api/client-errors.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      error,
      source: "boundary",
      context: typeof window !== "undefined" ? window.location.pathname : "route",
    });
  }, [error]);

  return (
    <div className="ic-error-boundary ic-error-boundary--page" role="alert">
      <div className="ic-error-boundary__icon" aria-hidden>
        ⚠
      </div>
      <h2 className="ic-error-boundary__title">This page hit a problem</h2>
      <p className="ic-error-boundary__msg">
        You can retry, or head back to your events. Your data is saved.
      </p>
      <div className="ic-error-boundary__actions">
        <button type="button" className="ic-btn-add" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="ic-link-btn">
          Back to events
        </Link>
      </div>
      {error.digest ? <p className="ic-error-boundary__ref">Reference: {error.digest}</p> : null}
    </div>
  );
}
