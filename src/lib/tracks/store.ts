"use client";

import { useEffect, useState } from "react";
import { create, useStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";

export type TrackPoint = { lat: number; lng: number; t: number };

type TracksState = { tracks: Record<string, TrackPoint[]> };
type TracksActions = {
  /** Append a fix to a unit's track, gated by movement/interval so stationary time doesn't bloat. */
  append: (unitId: string, pt: TrackPoint) => void;
  clear: (unitId?: string) => void;
};
export type TracksStore = TracksState & TracksActions;

/** Safety cap per unit so localStorage can't grow without bound over a very long incident. */
const MAX_POINTS = 5000;
/** Record a new point once the unit has moved this far… */
const MIN_MOVE_M = 12;
/** …or this long has passed since the last recorded point (captures dwelling). */
const MIN_INTERVAL_MS = 30_000;

function metersBetween(a: TrackPoint, b: TrackPoint): number {
  const dLat = (b.lat - a.lat) * 111_000;
  const dLng = (b.lng - a.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export function createTracksStore(eventId: string) {
  return create<TracksStore>()(
    persist(
      (set, get) => ({
        tracks: {},
        append: (unitId, pt) => {
          if (!unitId || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) return;
          const cur = get().tracks[unitId] ?? [];
          const last = cur[cur.length - 1];
          if (last && metersBetween(last, pt) < MIN_MOVE_M && pt.t - last.t < MIN_INTERVAL_MS) {
            return; // gate: not enough movement or time — skip (no state change, no re-render)
          }
          const next = last && last.lat === pt.lat && last.lng === pt.lng ? cur : [...cur, pt];
          if (next === cur) return;
          if (next.length > MAX_POINTS) next.splice(0, next.length - MAX_POINTS);
          set({ tracks: { ...get().tracks, [unitId]: next } });
        },
        clear: (unitId) => {
          if (unitId) {
            const rest = { ...get().tracks };
            delete rest[unitId];
            set({ tracks: rest });
          } else {
            set({ tracks: {} });
          }
        },
      }),
      { name: `mitiga-tracks-${eventId}` },
    ),
  );
}

const cache = new Map<string, ReturnType<typeof createTracksStore>>();

export function getTracksStore(eventId: string) {
  let s = cache.get(eventId);
  if (!s) {
    s = createTracksStore(eventId);
    cache.set(eventId, s);
  }
  return s;
}

export function useTracks<T>(eventId: string, selector: (s: TracksStore) => T): T {
  return useStore(getTracksStore(eventId), selector);
}

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (fn: () => void) => () => void;
};

export function useTracksHydrated(eventId: string): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const store = getTracksStore(eventId) as StoreApi<TracksStore> & { persist?: PersistApi };
    const p = store.persist;
    if (!p || p.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return p.onFinishHydration(() => setHydrated(true));
  }, [eventId]);
  return hydrated;
}
