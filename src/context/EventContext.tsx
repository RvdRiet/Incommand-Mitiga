"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

import { ActivityTracker } from "@/components/incident/ActivityTracker";
import type { IncidentStore } from "@/lib/incident/store";
import { getIncidentStore } from "@/lib/incident/incident-store-registry";

const EventIdContext = createContext<string | null>(null);
const IncidentStoreContext = createContext<StoreApi<IncidentStore> | null>(null);

export function EventProvider({
  eventId,
  children,
}: {
  eventId: string;
  children: ReactNode;
}) {
  const storeRef = useRef<StoreApi<IncidentStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = getIncidentStore(eventId);
  }

  return (
    <EventIdContext.Provider value={eventId}>
      <IncidentStoreContext.Provider value={storeRef.current}>
        <ActivityTracker />
        {children}
      </IncidentStoreContext.Provider>
    </EventIdContext.Provider>
  );
}

export function useEventId(): string {
  const id = useContext(EventIdContext);
  if (!id) {
    throw new Error("useEventId must be used within EventProvider");
  }
  return id;
}

export function useIncidentStore<T>(selector: (state: IncidentStore) => T): T {
  const store = useContext(IncidentStoreContext);
  if (!store) {
    throw new Error("useIncidentStore must be used within EventProvider");
  }
  return useStore(store, selector);
}

type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (fn: () => void) => () => void;
};

/** Wait for per-event localStorage before rendering store-driven UI (avoids React #418). */
export function useIncidentStoreHydrated(): boolean {
  const store = useContext(IncidentStoreContext);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!store) return;
    const persist = (store as StoreApi<IncidentStore> & { persist?: PersistApi }).persist;
    if (!persist) {
      setHydrated(true);
      return;
    }
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, [store]);

  return hydrated;
}
