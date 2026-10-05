"use client";

import { useEffect, useRef, useState } from "react";

import { useIncidentStoreApi } from "@/context/EventContext";

type SaveState = "saved" | "saving";

/**
 * Reassurance that edits persist. The incident store writes to localStorage on every
 * change, so "saving" is only ever momentary — we flash it briefly on each change and
 * settle back to "Saved", giving the operator visible confirmation nothing was lost.
 */
export function SaveIndicator() {
  const store = useIncidentStoreApi();
  const [state, setState] = useState<SaveState>("saved");
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mountedAt = Date.now();
    const unsub = store.subscribe(() => {
      // Skip the hydration set that fires right after mount (a load, not a save).
      if (Date.now() - mountedAt < 500) return;
      setState("saving");
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setState("saved"), 700);
    });
    return () => {
      unsub();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [store]);

  return (
    <span
      className={`ic-save-indicator ic-save-indicator--${state}`}
      title={
        state === "saving"
          ? "Saving your changes…"
          : "All changes saved on this device"
      }
      aria-live="polite"
    >
      <span className="ic-save-indicator__dot" aria-hidden />
      <span className="ic-save-indicator__text">
        {state === "saving" ? "Saving…" : "Saved"}
      </span>
    </span>
  );
}
