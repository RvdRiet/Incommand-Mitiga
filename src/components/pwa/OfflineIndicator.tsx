"use client";

import { useEffect, useState } from "react";

import { pendingCount } from "@/lib/offline/db";

/**
 * Small status pill: shows when the app is offline and how many local changes are
 * queued to sync. Availability-first — the app keeps working offline; this just
 * tells the operator what's happening.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const poll = setInterval(() => {
      void pendingCount().then(setPending);
      setOnline(navigator.onLine);
    }, 4000);
    void pendingCount().then(setPending);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(poll);
    };
  }, []);

  // Nothing to show when online with nothing queued.
  if (online && pending === 0) return null;

  const offline = !online;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 14,
        left: 14,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        color: offline ? "#0b1220" : "var(--text, #e5e7eb)",
        background: offline ? "#f59e0b" : "rgba(15,23,42,0.9)",
        border: "1px solid var(--border, #1f2937)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: offline ? "#7c2d12" : "#22c55e",
          display: "inline-block",
        }}
      />
      {offline ? "Offline — working locally" : "Syncing"}
      {pending > 0 ? (
        <span style={{ opacity: 0.85, fontWeight: 500 }}>
          · {pending} change{pending === 1 ? "" : "s"} queued
        </span>
      ) : null}
    </div>
  );
}
