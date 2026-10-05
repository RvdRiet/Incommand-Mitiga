"use client";

import { useEffect, useRef } from "react";

import { useEventId, useIncidentStoreApi } from "@/context/EventContext";
import type { IncidentStore } from "@/lib/incident/store";
import { saveLocalState } from "@/lib/offline/db";
import { pullRemote, startAutoSync } from "@/lib/offline/sync";

/**
 * Bridges the in-memory incident store to the offline database + server sync.
 *
 *  1. On mount, pulls the server copy and — if there are no unsynced local edits —
 *     HYDRATES the live store from it, so a fresh device / new session actually
 *     loads the incident's data (the pulled doc is already redacted to the role's
 *     visible modules server-side, so hidden modules simply aren't populated).
 *  2. Mirrors every change back into IndexedDB (debounced) as a coalesced outbox,
 *     which the sync engine flushes to Postgres when signed in and online.
 *
 * Purely additive — the existing localStorage persistence is untouched.
 */
export function OfflineSyncBridge() {
  const eventId = useEventId();
  const store = useIncidentStoreApi();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppress the mirror while we apply a server pull, so hydration isn't mistaken
  // for a local edit (which would mark it dirty and echo it back to the server).
  const suppressSave = useRef(false);

  // Start the background outbox drain once for the app.
  useEffect(() => startAutoSync(), []);

  // Hydrate from the server when the local copy has no unsynced edits.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pulled = await pullRemote(eventId);
      // Only adopt server state when it exists (baseRev>0) and we're not dirty.
      if (cancelled || !pulled || pulled.dirty !== 0 || pulled.baseRev <= 0) return;
      suppressSave.current = true;
      store.setState(pulled.state as unknown as Partial<IncidentStore>, false);
      // Re-enable mirroring after the debounce window so real edits are captured.
      setTimeout(() => {
        suppressSave.current = false;
      }, 1200);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, store]);

  // Mirror store data into the offline DB (debounced; JSON.stringify drops actions).
  useEffect(() => {
    const flush = () => {
      if (suppressSave.current) return;
      const snapshot = JSON.parse(JSON.stringify(store.getState())) as Record<string, unknown>;
      void saveLocalState(eventId, snapshot);
    };
    const unsub = store.subscribe(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [eventId, store]);

  return null;
}
