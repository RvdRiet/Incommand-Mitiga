import type { StoreApi } from "zustand";

import { attachIncidentActivityLogger } from "./activity-log";
import { createIncidentStore, type IncidentStore } from "./store";

const cache = new Map<string, StoreApi<IncidentStore>>();

export function getIncidentStore(eventId: string): StoreApi<IncidentStore> {
  let store = cache.get(eventId);
  if (!store) {
    store = createIncidentStore(eventId);
    attachIncidentActivityLogger(store);
    cache.set(eventId, store);
  }
  return store;
}

export function clearIncidentStoreCache(eventId?: string) {
  if (eventId) {
    cache.delete(eventId);
    return;
  }
  cache.clear();
}
