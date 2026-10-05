"use client";

/**
 * Dependency-free client error reporter. Captures React render errors (via the
 * ErrorBoundary), plus uncaught errors and unhandled promise rejections, and POSTs
 * them to /api/client-errors where the server logs them structurally (so they show
 * up in prod logs / any aggregator, and can later be forwarded to a real service).
 *
 * Fire-and-forget and fully offline-tolerant — a failed report never throws. Client
 * side de-dupes and caps volume so a render loop can't spam the endpoint.
 */

export type ErrorSource = "boundary" | "window" | "unhandledrejection" | "manual";

export type ClientErrorPayload = {
  message: string;
  stack?: string;
  source: ErrorSource;
  /** Module/route context, e.g. "comms" or the pathname. */
  context?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  at: string;
};

const MAX_PER_SESSION = 25; // don't flood the endpoint from a render loop
const DEDUPE_WINDOW_MS = 30_000;

let sent = 0;
const recent = new Map<string, number>(); // signature -> last-sent epoch ms

function signature(p: { message: string; stack?: string; context?: string }): string {
  return `${p.context ?? ""}|${p.message}|${(p.stack ?? "").slice(0, 200)}`;
}

/** Report a client error. Safe to call anywhere; never throws. */
export function reportClientError(input: {
  error: unknown;
  source: ErrorSource;
  context?: string;
  componentStack?: string;
}): void {
  try {
    if (typeof window === "undefined") return;
    const err = input.error;
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
    const stack = err instanceof Error ? err.stack : undefined;

    const sig = signature({ message, stack, context: input.context });
    const now = Date.now();
    const last = recent.get(sig);
    if (last && now - last < DEDUPE_WINDOW_MS) return; // repeat within window — skip
    if (sent >= MAX_PER_SESSION) return;
    recent.set(sig, now);
    sent += 1;

    const payload: ClientErrorPayload = {
      message: message.slice(0, 1000),
      stack: stack?.slice(0, 4000),
      source: input.source,
      context: input.context?.slice(0, 200),
      componentStack: input.componentStack?.slice(0, 4000),
      url: window.location?.href,
      userAgent: navigator?.userAgent,
      at: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);
    // sendBeacon survives page unload; fall back to fetch keepalive.
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* offline / blocked — reporting is best-effort */
      });
    }
  } catch {
    /* never let error reporting cause an error */
  }
}

let installed = false;

/** Install global handlers for uncaught errors + unhandled rejections (idempotent). */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    // Ignore ResourceLoad errors (img/script) which have no `error` object.
    if (!e.error && !e.message) return;
    reportClientError({ error: e.error ?? e.message, source: "window", context: window.location?.pathname });
  });

  window.addEventListener("unhandledrejection", (e) => {
    reportClientError({
      error: e.reason ?? "Unhandled promise rejection",
      source: "unhandledrejection",
      context: window.location?.pathname,
    });
  });
}
