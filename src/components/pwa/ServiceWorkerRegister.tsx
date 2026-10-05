"use client";

import { useEffect, useState } from "react";

/**
 * Registers the offline service worker (production only — a SW in `next dev`
 * breaks HMR) and keeps the app on the newest deployed iteration.
 *
 * AUTO-UPDATE ON LAUNCH: the desktop shell is a thin client, so "the newest
 * iteration as soon as it's launched" is the goal. Any update that is already
 * waiting when the app opens, or that finishes installing within the launch
 * window, is applied SILENTLY (skipWaiting → reload) — no click needed. Updates
 * that land later in a live session still show the gentle "Reload" prompt so we
 * never yank the page out from under someone mid-task. Long-running windows also
 * poll for updates periodically + on focus.
 */
// Updates detected within this window of opening are treated as "on launch" and
// applied automatically; later ones prompt instead.
const LAUNCH_AUTO_UPDATE_MS = 20_000;

export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Dev / thin-client-against-a-dev-server: proactively remove any service
      // worker left over from a previous PRODUCTION build. A stale SW keeps
      // intercepting requests on this origin and can serve broken/cached responses
      // for /api calls (e.g. the weather forecast), which looks like a random outage.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const launchedAt = Date.now();
    const withinLaunchWindow = () => Date.now() - launchedAt < LAUNCH_AUTO_UPDATE_MS;
    const applyNow = (worker: ServiceWorker) => worker.postMessage("SKIP_WAITING");

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r;
        // A newer version installed while the app was closed → this IS launch, so
        // take it automatically rather than prompting.
        if (r.waiting && navigator.serviceWorker.controller) applyNow(r.waiting);
        r.addEventListener("updatefound", () => {
          const next = r.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // Installed AND an old worker is controlling → it's an UPDATE, not a
            // first install.
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              if (withinLaunchWindow()) applyNow(next);
              else setWaiting(next);
            }
          });
        });
        // Check for a newer SW immediately on launch (don't wait for the interval).
        r.update().catch(() => {});
      })
      .catch((e) => console.warn("[sw] registration failed:", e));

    const check = () => reg?.update().catch(() => {});
    const interval = setInterval(check, 30 * 60 * 1000); // every 30 min
    window.addEventListener("focus", check);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      clearInterval(interval);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1001,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 12px 9px 16px",
        borderRadius: 999,
        fontSize: 14,
        color: "var(--text, #e5e7eb)",
        background: "rgba(15,23,42,0.95)",
        border: "1px solid var(--border, #1f2937)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
      }}
    >
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => waiting.postMessage("SKIP_WAITING")}
        style={{
          padding: "5px 12px",
          borderRadius: 999,
          border: "none",
          background: "var(--accent, #38bdf8)",
          color: "#0b1220",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Reload
      </button>
    </div>
  );
}
