"use client";

import dynamic from "next/dynamic";
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

import { EventsTopBar } from "./EventsTopBar";

const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => <div className="events-map events-map--loading">Loading map…</div>,
});

const LANDING_MAP_CENTER: [number, number] = [31.17485, -24.43707];

export function EventsLandingPage() {
  const router = useRouter();
  const storeHydrated = useEventsStoreHydrated();
  const organizationName = useEventsStore((s) => s.organizationName);
  const events = useEventsStore((s) => s.events);
  const createEvent = useEventsStore((s) => s.createEvent);
  const archiveEvent = useEventsStore((s) => s.archiveEvent);

  const [archivedOpen, setArchivedOpen] = useState(false);
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [newEventName, setNewEventName] = useState("");

  const active = useMemo(() => getActiveEvents(events), [events]);
  const archived = useMemo(() => getArchivedEvents(events), [events]);

  const startNew = () => {
    const name = newEventName.trim() || "New Event";
    const id = createEvent(name);
    setNewEventOpen(false);
    setNewEventName("");
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
            ) : (
              <form
                className="events-new-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  startNew();
                }}
              >
                <input
                  type="text"
                  placeholder="Event name"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="ic-btn-add">
                  Create
                </button>
                <button type="button" className="ic-link-btn" onClick={() => setNewEventOpen(false)}>
                  Cancel
                </button>
              </form>
            )}
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            <circle cx="12" cy="12" r="3" />
          </svg>
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
  const label =
    status === "planning"
      ? "Planning"
      : status === "activated"
        ? "Activated"
        : status === "closed"
          ? "Closed"
          : "No status";
  const chipClass =
    status === "none"
      ? "events-status-chip"
      : `events-status-chip events-status-chip--${status}`;
  return <span className={chipClass}>{label}</span>;
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
