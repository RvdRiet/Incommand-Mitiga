"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { newId, nowIso, nowLocalInput } from "@/lib/incident/id";
import { buildFormRecord } from "@/lib/incident/ics-forms-catalog";
import { createInitialIncidentState } from "@/lib/incident/initial-state";
import type { IcsFormRecord, TaskItem } from "@/lib/incident/types";

import { DEMO_EVENT, DEMO_EVENT_ID, ensureDemoIncidentState } from "@/lib/incident/demo-seed";

import { getIncidentTemplate } from "./templates";
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
      startDate: situation.startDate ?? nowLocalInput(),
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

type ServerEventRecord = { id: string; name: string; createdAt?: string | null };

type EventsState = {
  organizationName: string;
  events: EventRecord[];
  /** The tenant this browser's event list belongs to (set once a real user signs in).
   *  null = anonymous/expo browser (gets the demo seed). Used to keep one tenant from
   *  ever seeing another tenant's events on a shared browser. */
  tenantScope: string | null;
};

type EventsActions = {
  createEvent: (name?: string, templateId?: string) => string;
  updateEvent: (id: string, patch: Partial<EventRecord>) => void;
  archiveEvent: (id: string) => void;
  restoreEvent: (id: string) => void;
  removeEvent: (id: string) => void;
  setOrganizationName: (name: string) => void;
  /** Merge incidents that exist on the server but not yet in this browser's list,
   *  so events created on another device/browser show up here. Additive only.
   *  Used for the anonymous/expo (signed-out) experience. */
  mergeServerEvents: (records: ServerEventRecord[]) => void;
  /** Reconcile the list for a SIGNED-IN tenant. Within the same tenant it merges
   *  additively (preserving locally-created, not-yet-synced events); when the tenant
   *  differs from what this browser last held (a different account, or the first real
   *  sign-in over the demo seed) it REPLACES the list with just this tenant's server
   *  events — so no tenant ever sees the demo seed or another tenant's events. */
  syncTenantEvents: (tenantId: string, records: ServerEventRecord[]) => void;
};

export type EventsStore = EventsState & EventsActions;

/** Map a server incident row to the local EventRecord shape. */
const serverToEventRecord = (r: ServerEventRecord): EventRecord => ({
  id: r.id,
  name: r.name || "Untitled incident",
  status: "none",
  startDate: (r.createdAt ?? "").slice(0, 16),
  endDate: "",
  archived: false,
  lat: null,
  lng: null,
  createdAt: r.createdAt ?? new Date().toISOString(),
});

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
      tenantScope: null,

      createEvent: (name, templateId) => {
        const id = newId();
        const template = getIncidentTemplate(templateId);
        const eventName = name?.trim() || template?.name || "New Event";
        const event: EventRecord = {
          id,
          name: eventName,
          status: "none",
          startDate: nowLocalInput(),
          endDate: "",
          archived: false,
          lat: null,
          lng: null,
          createdAt: nowIso(),
          icon: template?.icon,
          templateId: template && template.id !== "blank" ? template.id : undefined,
        };
        set((s) => ({ events: [event, ...s.events] }));
        if (typeof window !== "undefined") {
          // Seed a complete incident state, applying template starters.
          const state = createInitialIncidentState(eventName);
          if (template) {
            state.situation = {
              ...state.situation,
              summary: template.situationSummary,
              objectives: template.objectives,
            };
            if (template.runbook) {
              const items: TaskItem[] = template.runbook.items.map((title) => ({
                id: newId(),
                title,
                status: "not_started",
              }));
              state.taskLists = [
                { id: newId(), name: template.runbook.name, items },
                ...state.taskLists,
              ];
            }
          }
          // Every incident starts with ICS 201 (Incident Briefing) and ICS 202
          // (Incident Objectives) already on the board, prefilled from the situation.
          const seededForms = ["ICS-201", "ICS-202"]
            .map((tid) =>
              buildFormRecord(tid, {
                incidentName: state.situation.name,
                dateTime: state.situation.startDate,
                operationalPeriod: state.situation.startDate,
                objectives: state.situation.objectives,
                currentSituation: state.situation.summary,
              }),
            )
            .filter((f): f is IcsFormRecord => f !== null);
          state.forms = [...seededForms, ...state.forms];
          const stub = { state, version: 0 };
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

      mergeServerEvents: (records) => {
        set((s) => {
          const known = new Set(s.events.map((e) => e.id));
          const additions = records
            .filter((r) => r.id && !known.has(r.id))
            .map(serverToEventRecord);
          return additions.length ? { events: [...additions, ...s.events] } : s;
        });
      },

      syncTenantEvents: (tenantId, records) => {
        set((s) => {
          if (s.tenantScope === tenantId) {
            // Same tenant — additive merge so events created offline here, or on
            // another device, both survive.
            const known = new Set(s.events.map((e) => e.id));
            const additions = records
              .filter((r) => r.id && !known.has(r.id))
              .map(serverToEventRecord);
            return additions.length ? { events: [...additions, ...s.events] } : s;
          }
          // A different tenant (or the first real sign-in over the demo seed) now owns
          // this browser: start from THIS tenant's server events only.
          return {
            tenantScope: tenantId,
            events: records.filter((r) => r.id).map(serverToEventRecord),
          };
        });
      },
    }),
    {
      name: "mitiga-events-v1",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Once a real tenant owns this browser (tenantScope set), never seed demo or
        // legacy content — the signed-in events come from the server via
        // syncTenantEvents. The demo seed below is only for the anonymous/expo browser.
        if (state.tenantScope) return;
        // Legacy single-incident migration only applies to a first-run empty list.
        if (state.events.length === 0) {
          const migrated = migrateLegacyIncident();
          if (migrated) state.events = [migrated.event];
        }
        // For the anonymous/expo experience only: ensure the populated demo incident
        // is present (card + full local state) so it's there for offline demos without
        // login or a server round-trip. Idempotent: added only if missing.
        ensureDemoIncidentState();
        if (!state.events.some((e) => e.id === DEMO_EVENT_ID)) {
          state.events = [DEMO_EVENT, ...state.events];
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