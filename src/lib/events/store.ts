"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { newId, nowIso } from "@/lib/incident/id";
import { defaultSituation } from "@/lib/incident/initial-state";

import type { EventRecord, EventStatus } from "./types";

export const DEFAULT_ORGANIZATION_NAME = "Ehlanzeni District Municipality";

/** Stable default event id so SSR matches the first client paint before localStorage rehydrates. */
export const DEFAULT_SEED_EVENT_ID = "00000000-0000-4000-8000-000000000001";

const LEGACY_INCIDENT_KEY = "mitiga-incident-v1";

function migrateLegacyIncident(): { event: EventRecord; legacyState: unknown } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_INCIDENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: {
        situation?: {
          name?: string;
          startDate?: string;
          lat?: number | null;
          lng?: number | null;
          activationLevel?: string;
        };
      };
    };
    const situation = parsed.state?.situation;
    if (!situation?.name) return null;
    const id = newId();
    const event: EventRecord = {
      id,
      name: situation.name,
      status: mapActivationToStatus(situation.activationLevel),
      startDate: situation.startDate ?? nowIso().slice(0, 16),
      endDate: "",
      archived: false,
      lat: situation.lat ?? null,
      lng: situation.lng ?? null,
      createdAt: nowIso(),
    };
    localStorage.setItem(`mitiga-incident-${id}`, raw);
    localStorage.removeItem(LEGACY_INCIDENT_KEY);
    return { event, legacyState: parsed.state };
  } catch {
    return null;
  }
}

function mapActivationToStatus(level?: string): EventStatus {
  if (level === "activated") return "activated";
  if (level === "closed") return "closed";
  if (level === "planning") return "planning";
  return "none";
}

type EventsState = {
  organizationName: string;
  events: EventRecord[];
};

type EventsActions = {
  createEvent: (name?: string) => string;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  archiveEvent: (id: string) => void;
  restoreEvent: (id: string) => void;
  removeEvent: (id: string) => void;
  setOrganizationName: (name: string) => void;
};

export type EventsStore = EventsState & EventsActions;

const seedStadiumEvent = (): EventRecord => ({
  id: DEFAULT_SEED_EVENT_ID,
  name: "Stadium Event",
  status: "none",
  startDate: "2026-01-01T08:00",
  endDate: "",
  archived: false,
  lat: -25.7479,
  lng: 28.2293,
  createdAt: "2026-01-01T08:00:00.000Z",
});

/** Wait for persisted events before rendering links (avoids SSR/client href mismatch). */
export function useEventsStoreHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useEventsStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useEventsStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}

export const useEventsStore = create<EventsStore>()(
  persist(
    (set, get) => ({
      organizationName: DEFAULT_ORGANIZATION_NAME,
      events: [seedStadiumEvent()],

      createEvent: (name) => {
        const id = newId();
        const eventName = name?.trim() || "New Event";
        const event: EventRecord = {
          id,
          name: eventName,
          status: "none",
          startDate: nowIso().slice(0, 16),
          endDate: "",
          archived: false,
          lat: null,
          lng: null,
          createdAt: nowIso(),
        };
        set((s) => ({ events: [event, ...s.events] }));
        if (typeof window !== "undefined") {
          const situation = defaultSituation(eventName);
          const stub = {
            state: {
              situation,
              personnel: [],
              roleGroups: [],
              logs: [],
              audit: [],
              forms: [],
              taskLists: [],
              damages: [],
              residents: [],
              residentAreas: [],
              resourceRequests: [],
              roadDamages: [],
              shelters: [],
              utilities: [],
              library: [],
              mapAnnotations: [],
              calendarEvents: [],
              operationalPeriods: [],
              settings: {
                timezone: "America/Johannesburg",
                defaultActivationLevel: "planning",
                enablePublicPortal: false,
              },
            },
            version: 0,
          };
          localStorage.setItem(`mitiga-incident-${id}`, JSON.stringify(stub));
        }
        return id;
      },

      updateEvent: (id, patch) => {
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
      },

      archiveEvent: (id) => {
        get().updateEvent(id, { archived: true });
      },

      restoreEvent: (id) => {
        get().updateEvent(id, { archived: false });
      },

      removeEvent: (id) => {
        set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
        if (typeof window !== "undefined") {
          localStorage.removeItem(`mitiga-incident-${id}`);
        }
      },

      setOrganizationName: (name) => set({ organizationName: name }),
    }),
    {
      name: "mitiga-events-v1",
      onRehydrateStorage: () => (state) => {
        if (!state || state.events.length > 0) return;
        const migrated = migrateLegacyIncident();
        if (migrated) {
          state.events = [migrated.event];
        }
      },
    },
  ),
);

export function getActiveEvents(events: EventRecord[]) {
  return events.filter((e) => !e.archived);
}

export function getArchivedEvents(events: EventRecord[]) {
  return events.filter((e) => e.archived);
}

export function eventHref(eventId: string, moduleSlug = "") {
  return moduleSlug
    ? `/events/${eventId}/dashboard/${moduleSlug}`
    : `/events/${eventId}/dashboard`;
}
