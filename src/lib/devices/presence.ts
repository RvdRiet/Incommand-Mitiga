"use client";

import { useEffect, useState } from "react";

/**
 * A bodycam is considered **online** only while it keeps checking in (telemetry /
 * SOS updates its `lastSeenAt`). If nothing arrives for this long, it is treated
 * as offline so operators don't try to reach a device that isn't there.
 */
export const DEVICE_OFFLINE_AFTER_MS = 60_000;

export type DevicePresence = "online" | "offline";

/** Clamp a per-incident "offline after N seconds" setting to a sane threshold in ms. */
export function offlineThresholdMs(deviceOfflineAfterSec: number | undefined | null): number {
  const s = Number(deviceOfflineAfterSec);
  return (Number.isFinite(s) && s >= 5 ? s : 60) * 1000;
}

/** Derive online/offline from a device's last check-in time. */
export function devicePresence(
  lastSeenAt: string | null | undefined,
  now: number = Date.now(),
  thresholdMs: number = DEVICE_OFFLINE_AFTER_MS,
): DevicePresence {
  if (!lastSeenAt) return "offline";
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return "offline";
  return now - t <= thresholdMs ? "online" : "offline";
}

/** Human-friendly "last seen" label. */
export function lastSeenLabel(
  lastSeenAt: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!lastSeenAt) return "never seen";
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return "never seen";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * Re-renders on an interval so presence (which decays with wall-clock time) stays
 * current even when no new events arrive — a device seen 40s ago flips to offline
 * on its own once the threshold passes.
 */
export function useNow(intervalMs: number = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
