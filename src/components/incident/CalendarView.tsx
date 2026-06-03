"use client";

import { useMemo, useState } from "react";

import {
  addMonths,
  buildMonthGrid,
  eventOverlapsDay,
  formatEventRange,
  monthLabel,
  weekdayLabels,
} from "@/lib/incident/calendar-utils";
import { useIncidentStore } from "@/context/EventContext";
import type { CalendarEvent, CalendarEventType } from "@/lib/incident/types";

import { RowDelete } from "./shared";

const EVENT_TYPES: { value: CalendarEventType; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "briefing", label: "Briefing" },
  { value: "operational_period", label: "Operational period" },
  { value: "exercise", label: "Exercise" },
  { value: "meeting", label: "Meeting" },
  { value: "deployment", label: "Deployment" },
  { value: "other", label: "Other" },
];

const TYPE_CLASS: Record<CalendarEventType, string> = {
  planning: "ic-cal-dot--planning",
  briefing: "ic-cal-dot--briefing",
  operational_period: "ic-cal-dot--op",
  exercise: "ic-cal-dot--exercise",
  meeting: "ic-cal-dot--meeting",
  deployment: "ic-cal-dot--deployment",
  other: "ic-cal-dot--other",
};

export function CalendarView() {
  const events = useIncidentStore((s) => s.calendarEvents);
  const operationalPeriods = useIncidentStore((s) => s.operationalPeriods);
  const addCalendarEvent = useIncidentStore((s) => s.addCalendarEvent);
  const updateCalendarEvent = useIncidentStore((s) => s.updateCalendarEvent);
  const removeCalendarEvent = useIncidentStore((s) => s.removeCalendarEvent);
  const addOperationalPeriod = useIncidentStore((s) => s.addOperationalPeriod);
  const updateOperationalPeriod = useIncidentStore((s) => s.updateOperationalPeriod);
  const removeOperationalPeriod = useIncidentStore((s) => s.removeOperationalPeriod);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const grid = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const eventsForDay = useMemo(
    () =>
      events.filter((e) =>
        eventOverlapsDay(e.startAt, e.endAt, viewYear, viewMonth, selectedDay),
      ),
    [events, viewYear, viewMonth, selectedDay],
  );

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...events]
      .filter((e) => new Date(e.endAt || e.startAt).getTime() >= now)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .slice(0, 8);
  }, [events]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const goPrev = () => {
    const n = addMonths(viewYear, viewMonth, -1);
    setViewYear(n.year);
    setViewMonth(n.month);
  };

  const goNext = () => {
    const n = addMonths(viewYear, viewMonth, 1);
    setViewYear(n.year);
    setViewMonth(n.month);
  };

  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  const selectDay = (day: number | null) => {
    if (day == null) return;
    setSelectedDay(day);
    setSelectedEventId(null);
  };

  const addEventOnSelectedDay = () => {
    const start = new Date(viewYear, viewMonth, selectedDay, 9, 0);
    const end = new Date(viewYear, viewMonth, selectedDay, 17, 0);
    const id = addCalendarEvent({
      startAt: start.toISOString().slice(0, 16),
      endAt: end.toISOString().slice(0, 16),
    });
    setSelectedEventId(id);
  };

  return (
    <section className="ic-calendar">
      <header className="ic-calendar__toolbar">
        <div className="ic-calendar__nav">
          <button type="button" onClick={goPrev} aria-label="Previous month">
            ‹
          </button>
          <h2 className="ic-calendar__title">{monthLabel(viewYear, viewMonth)}</h2>
          <button type="button" onClick={goNext} aria-label="Next month">
            ›
          </button>
          <button type="button" className="ic-link-btn" onClick={goToday}>
            Today
          </button>
        </div>
        <div className="ic-calendar__actions">
          <button type="button" className="ic-link-btn" onClick={() => addOperationalPeriod()}>
            + Operational period
          </button>
          <button type="button" className="ic-btn-add" onClick={addEventOnSelectedDay}>
            + Event
          </button>
        </div>
      </header>

      <div className="ic-calendar__body">
        <div className="ic-calendar__month">
          <div className="ic-calendar__weekdays">
            {weekdayLabels().map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="ic-calendar__grid">
            {grid.map((day, i) => {
              if (day == null) {
                return <div key={`pad-${i}`} className="ic-calendar__cell ic-calendar__cell--pad" />;
              }
              const isToday =
                day === today.getDate() &&
                viewMonth === today.getMonth() &&
                viewYear === today.getFullYear();
              const isSelected = day === selectedDay;
              const dayEvents = events.filter((e) =>
                eventOverlapsDay(e.startAt, e.endAt, viewYear, viewMonth, day),
              );
              return (
                <button
                  key={day}
                  type="button"
                  className={`ic-calendar__cell ${isSelected ? "ic-calendar__cell--selected" : ""} ${isToday ? "ic-calendar__cell--today" : ""}`}
                  onClick={() => selectDay(day)}
                >
                  <span className="ic-calendar__day-num">{day}</span>
                  <span className="ic-calendar__dots">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        className={`ic-cal-dot ${TYPE_CLASS[e.type]}`}
                        title={e.title}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="ic-calendar__sidebar">
          <h3 className="ic-calendar__sidebar-title">
            {new Date(viewYear, viewMonth, selectedDay).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>

          {eventsForDay.length === 0 ? (
            <p className="ic-empty-hint">No events this day.</p>
          ) : (
            <ul className="ic-calendar__day-list">
              {eventsForDay.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`ic-calendar__event-pill ${selectedEventId === e.id ? "ic-calendar__event-pill--active" : ""}`}
                    onClick={() => setSelectedEventId(e.id)}
                  >
                    <span className={`ic-cal-dot ${TYPE_CLASS[e.type]}`} />
                    <span>{e.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className="ic-calendar__sidebar-title">Upcoming</h3>
          <ul className="ic-calendar__upcoming">
            {upcoming.length === 0 ? (
              <li className="ic-empty-hint">No upcoming events.</li>
            ) : (
              upcoming.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="ic-calendar__upcoming-item"
                    onClick={() => {
                      const d = new Date(e.startAt);
                      setViewYear(d.getFullYear());
                      setViewMonth(d.getMonth());
                      setSelectedDay(d.getDate());
                      setSelectedEventId(e.id);
                    }}
                  >
                    <strong>{e.title}</strong>
                    <span>{formatEventRange(e.startAt, e.endAt, e.allDay)}</span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {operationalPeriods.length > 0 ? (
            <>
              <h3 className="ic-calendar__sidebar-title">Operational periods</h3>
              <ul className="ic-calendar__op-list">
                {operationalPeriods.map((op) => (
                  <li key={op.id}>
                    <span>
                      {op.name} (#{op.number})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      </div>

      {selectedEvent ? (
        <EventEditor
          event={selectedEvent}
          onChange={(patch) => updateCalendarEvent(selectedEvent.id, patch)}
          onDelete={() => {
            if (selectedEvent.operationalPeriodId) {
              removeOperationalPeriod(selectedEvent.operationalPeriodId);
            } else {
              removeCalendarEvent(selectedEvent.id);
            }
            setSelectedEventId(null);
          }}
          onOpChange={
            selectedEvent.operationalPeriodId
              ? (patch) =>
                  updateOperationalPeriod(selectedEvent.operationalPeriodId!, patch)
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

function EventEditor({
  event,
  onChange,
  onDelete,
  onOpChange,
}: {
  event: CalendarEvent;
  onChange: (patch: Partial<CalendarEvent>) => void;
  onDelete: () => void;
  onOpChange?: (patch: {
    name?: string;
    startsAt?: string;
    endsAt?: string;
    objectives?: string;
  }) => void;
}) {
  return (
    <footer className="ic-calendar__editor">
      <div className="ic-calendar__editor-head">
        <h3>Edit event</h3>
        <RowDelete onClick={onDelete} />
      </div>
      <div className="ic-calendar__editor-grid">
        <label className="ic-field">
          <span>Title</span>
          <input
            type="text"
            value={event.title}
            onChange={(e) => {
              onChange({ title: e.target.value });
              onOpChange?.({ name: e.target.value });
            }}
          />
        </label>
        <label className="ic-field">
          <span>Type</span>
          <select
            value={event.type}
            onChange={(e) => onChange({ type: e.target.value as CalendarEventType })}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ic-field">
          <span>Start</span>
          <input
            type="datetime-local"
            value={event.startAt}
            onChange={(e) => {
              onChange({ startAt: e.target.value });
              onOpChange?.({ startsAt: e.target.value });
            }}
          />
        </label>
        <label className="ic-field">
          <span>End</span>
          <input
            type="datetime-local"
            value={event.endAt}
            onChange={(e) => {
              onChange({ endAt: e.target.value });
              onOpChange?.({ endsAt: e.target.value });
            }}
          />
        </label>
        <label className="ic-field ic-field--checkbox">
          <input
            type="checkbox"
            checked={event.allDay}
            onChange={(e) => onChange({ allDay: e.target.checked })}
          />
          <span>All day</span>
        </label>
        <label className="ic-field ic-field--full">
          <span>Location</span>
          <input
            type="text"
            value={event.location}
            onChange={(e) => onChange({ location: e.target.value })}
          />
        </label>
        <label className="ic-field ic-field--full">
          <span>Description / objectives</span>
          <textarea
            rows={3}
            value={event.description}
            onChange={(e) => {
              onChange({ description: e.target.value });
              onOpChange?.({ objectives: e.target.value });
            }}
          />
        </label>
      </div>
    </footer>
  );
}
