"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_ORGANIZATION_NAME,
  eventHref,
  getActiveEvents,
  getArchivedEvents,
  useEventsStore,
  useEventsStoreHydrated,
} from "@/lib/events/store";
import type { EventRecord, EventStatus } from "@/lib/events/types";
import { INCIDENT_TEMPLATES, type IncidentTemplate } from "@/lib/events/templates";
import { isModuleInEdition } from "@/lib/editions";
import { IconUsers } from "@/components/dashboard/icons";
import { IconVideo } from "@/components/ui/icons";

import { EventsTopBar } from "./EventsTopBar";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => <div className="events-map events-map--loading">Loading map…</div>,
});

const LANDING_MAP_CENTER: [number, number] = [31.17485, -24.43707];

export function EventsLandingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const tenantId = session?.tenantId;
  const storeHydrated = useEventsStoreHydrated();
  const organizationName = useEventsStore((s) => s.organizationName);
  const events = useEventsStore((s) => s.events);
  const createEvent = useEventsStore((s) => s.createEvent);
  const archiveEvent = useEventsStore((s) => s.archiveEvent);
  const mergeServerEvents = useEventsStore((s) => s.mergeServerEvents);
  const syncTenantEvents = useEventsStore((s) => s.syncTenantEvents);
  const setOrganizationName = useEventsStore((s) => s.setOrganizationName);

  // Pull the tenant's incidents from the server so events created on another device
  // or browser appear here too (the list is otherwise local to each browser).
  // When signed in, scope the list to the tenant (syncTenantEvents) so a fresh tenant
  // starts clean and never sees the demo seed or another account's events on a shared
  // browser. Signed out, fall back to an additive merge (expo/offline demo).
  // Best-effort: on failure (offline) we keep the local list.
  useEffect(() => {
    if (!storeHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/incidents");
        if (!res.ok) return;
        const data = (await res.json()) as {
          incidents: { id: string; name: string; createdAt: string | null }[];
        };
        if (cancelled || !Array.isArray(data.incidents)) return;
        if (tenantId) {
          // If a DIFFERENT tenant previously owned this browser, purge the per-incident
          // caches (Dexie + localStorage) before reconciling, so the prior tenant's
          // incident state is never shown or synced under this one.
          const prevScope = useEventsStore.getState().tenantScope;
          if (prevScope && prevScope !== tenantId) {
            const { clearLocalIncidentCaches } = await import("@/lib/offline/db");
            await clearLocalIncidentCaches();
          }
          syncTenantEvents(tenantId, data.incidents);
        } else {
          mergeServerEvents(data.incidents);
        }
      } catch {
        /* offline / not signed in — keep local events */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeHydrated, tenantId, syncTenantEvents, mergeServerEvents]);

  // Hydrate the org name from the server so the name captured in the first-run setup
  // wizard (stored in the DB, tenant-wide) shows in the header on every device — not
  // just the browser the wizard was completed in. The local store is the fallback.
  useEffect(() => {
    if (!storeHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/setup/status");
        if (!res.ok) return;
        const data = (await res.json()) as { orgName?: string; tenantName?: string };
        const name = (data.orgName || data.tenantName || "").trim();
        if (!cancelled && name) setOrganizationName(name);
      } catch {
        /* offline / not signed in — keep the locally stored org name */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeHydrated, setOrganizationName]);

  const [archivedOpen, setArchivedOpen] = useState(false);
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<IncidentTemplate | null>(null);
  const [newEventName, setNewEventName] = useState("");

  const active = useMemo(() => getActiveEvents(events), [events]);
  const archived = useMemo(() => getArchivedEvents(events), [events]);

  const closeNew = () => {
    setNewEventOpen(false);
    setSelectedTemplate(null);
    setNewEventName("");
  };

  const pickTemplate = (template: IncidentTemplate) => {
    setSelectedTemplate(template);
    setNewEventName(template.id === "blank" ? "" : template.name);
  };

  const startNew = () => {
    if (!selectedTemplate) return;
    const name = newEventName.trim() || selectedTemplate.name || "New Event";
    const id = createEvent(name, selectedTemplate.id);
    closeNew();
    router.push(eventHref(id));
  };

  return (
    <div className="events-page">
      <EventsTopBar organizationName={organizationName || DEFAULT_ORGANIZATION_NAME} />

      <div className="events-hero">
        <div className="events-hero__intro">
          <p className="events-hero__eyebrow">Incident management</p>
          <h1 className="events-hero__title">Your events</h1>
          <p className="events-hero__subtitle">
            Open an event to run the command dashboard, ICS forms, calendar, and operational
            modules. Each event keeps its own data separate.
          </p>

          <div className="events-start-row">
            {!newEventOpen ? (
              <button type="button" className="events-start-btn" onClick={() => setNewEventOpen(true)}>
                <span className="events-start-btn__icon">+</span>
                New event
              </button>
            ) : !selectedTemplate ? (
              <div className="events-template-picker">
                <div className="events-template-picker__head">
                  <strong>Start a new incident</strong>
                  <button type="button" className="ic-link-btn" onClick={closeNew}>
                    Cancel
                  </button>
                </div>
                <div className="events-template-grid">
                  {INCIDENT_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="events-template-tile"
                      onClick={() => pickTemplate(t)}
                    >
                      <span className="events-template-tile__icon" aria-hidden>
                        {t.icon}
                      </span>
                      <span className="events-template-tile__name">{t.name}</span>
                      <span className="events-template-tile__blurb">{t.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <form
                className="events-new-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  startNew();
                }}
              >
                <span className="events-new-form__icon" aria-hidden>
                  {selectedTemplate.icon}
                </span>
                <input
                  type="text"
                  placeholder="Incident name"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="ic-btn-add">
                  Start Incident
                </button>
                <button
                  type="button"
                  className="ic-link-btn"
                  onClick={() => setSelectedTemplate(null)}
                >
                  Back
                </button>
              </form>
            )}
            <Link href="/roster" className="events-registry-btn" title="Manage your org-wide staff roster">
              <span className="events-registry-btn__icon" aria-hidden><IconUsers /></span>
              Personnel roster
            </Link>
            {isModuleInEdition("devices") ? (
              <Link href="/devices" className="events-registry-btn" title="Manage bodycams reusable across incidents">
                <span className="events-registry-btn__icon" aria-hidden><IconVideo /></span>
                Device registry
              </Link>
            ) : null}
          </div>

          <h2 className="events-section-title">Active events</h2>
          <ul className="events-list">
            {!storeHydrated ? (
              <li className="events-empty">Loading events…</li>
            ) : active.length === 0 ? (
              <li className="events-empty">No active events yet. Create one to get started.</li>
            ) : (
              active.map((event) => (
                <EventRow key={event.id} event={event} onArchive={() => archiveEvent(event.id)} />
              ))
            )}
          </ul>

          {storeHydrated && archived.length > 0 ? (
            <section className="events-archived">
              <button
                type="button"
                className="events-archived__toggle"
                onClick={() => setArchivedOpen((v) => !v)}
                aria-expanded={archivedOpen}
              >
                <span className="events-archived__arrow">{archivedOpen ? "▾" : "▸"}</span>
                Archived ({archived.length})
              </button>
              {archivedOpen ? (
                <ul className="events-list events-list--archived">
                  {archived.map((event) => (
                    <EventRow key={event.id} event={event} archived />
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="events-hero__map-card" aria-label="Regional overview map">
          <MapCanvas center={LANDING_MAP_CENTER} zoom={5} className="events-map" />
          <span className="events-map-label">Regional overview</span>
        </aside>
      </div>
    </div>
  );
}

function EventRow({
  event,
  archived,
  onArchive,
}: {
  event: EventRecord;
  archived?: boolean;
  onArchive?: () => void;
}) {
  return (
    <li className="events-row">
      <Link href={eventHref(event.id)} className="events-row__link">
        <span className="events-row__icon" aria-hidden>
          {event.icon ? (
            <span className="events-row__icon-emoji">{event.icon}</span>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </span>
        <span className="events-row__body">
          <strong>{event.name}</strong>
          <span className="events-row__meta">
            <StatusChip status={event.status} />
            <EventTimer startDate={event.startDate} />
          </span>
        </span>
        <span className="events-row__chevron" aria-hidden>
          →
        </span>
      </Link>
      {!archived && onArchive ? (
        <button
          type="button"
          className="events-row__archive"
          title="Archive event"
          onClick={(e) => {
            e.preventDefault();
            onArchive();
          }}
        >
          Archive
        </button>
      ) : null}
    </li>
  );
}

function StatusChip({ status }: { status: EventStatus }) {
  // Badge diet: only "Activated" is an attention state that earns a chip. Planning,
  // closed, and no-status read as plain text so activated events actually stand out.
  if (status === "activated") {
    return <span className="events-status-chip events-status-chip--activated">Activated</span>;
  }
  const label =
    status === "planning" ? "Planning" : status === "closed" ? "Closed" : "No status";
  return <span className="events-status-plain">{label}</span>;
}

function EventTimer({ startDate }: { startDate: string }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      setLabel("");
      return;
    }
    const tick = () => {
      const ms = Math.max(0, Date.now() - start.getTime());
      const days = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      setLabel(`${days}d ${h}h elapsed`);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [startDate]);

  if (!label) return null;
  return <span className="events-row__timer">{label}</span>;
}
