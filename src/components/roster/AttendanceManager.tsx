"use client";

import { useMemo, useState } from "react";

import {
  ATTENDANCE_STATUS_META,
  ATTENDANCE_STATUS_ORDER,
  attendanceFor,
  toDateInput,
  useAttendance,
  useAttendanceHydrated,
  type AttendanceStatus,
} from "@/lib/roster/attendance";
import { useOrgRoster } from "@/lib/roster/store";

export function AttendanceManager() {
  const people = useOrgRoster((s) => s.people);
  const records = useAttendance((s) => s.records);
  const setStatus = useAttendance((s) => s.setStatus);
  const patch = useAttendance((s) => s.patch);
  const clearMark = useAttendance((s) => s.clearMark);
  const hydrated = useAttendanceHydrated();

  const [date, setDate] = useState(() => toDateInput());

  const summary = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
    for (const p of people) {
      const rec = attendanceFor(records, date, p.id);
      if (!rec) counts.unmarked += 1;
      else counts[rec.status] += 1;
    }
    return counts;
  }, [people, records, date]);

  const shiftDate = (deltaDays: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setDate(toDateInput(d));
  };

  const markAll = (status: AttendanceStatus) => {
    for (const p of people) setStatus(p.id, date, status);
  };

  return (
    <section className="ic-attend">
      <div className="ic-attend__bar">
        <div className="ic-attend__date">
          <button type="button" className="ic-attend__nav" onClick={() => shiftDate(-1)} aria-label="Previous day">
            ‹
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || toDateInput())}
            aria-label="Attendance date"
          />
          <button type="button" className="ic-attend__nav" onClick={() => shiftDate(1)} aria-label="Next day">
            ›
          </button>
          <button type="button" className="ic-link-btn" onClick={() => setDate(toDateInput())}>
            Today
          </button>
        </div>
        <div className="ic-attend__summary">
          <span className="ic-attend__chip ic-attend__chip--present">{summary.present} present</span>
          <span className="ic-attend__chip ic-attend__chip--late">{summary.late} late</span>
          <span className="ic-attend__chip ic-attend__chip--absent">{summary.absent} absent</span>
          <span className="ic-attend__chip ic-attend__chip--excused">{summary.excused} excused</span>
          {summary.unmarked > 0 ? (
            <span className="ic-attend__chip ic-attend__chip--unmarked">{summary.unmarked} unmarked</span>
          ) : null}
        </div>
      </div>

      {people.length > 0 ? (
        <div className="ic-attend__markall">
          Mark all:
          {ATTENDANCE_STATUS_ORDER.map((s) => (
            <button key={s} type="button" className="ic-link-btn" onClick={() => markAll(s)}>
              {ATTENDANCE_STATUS_META[s].label}
            </button>
          ))}
        </div>
      ) : null}

      {!hydrated ? (
        <p className="dev-registry__empty">Loading…</p>
      ) : people.length === 0 ? (
        <p className="dev-registry__empty">Add people to the roster first, then take attendance here.</p>
      ) : (
        <ul className="ic-attend__list">
          {people.map((p) => {
            const rec = attendanceFor(records, date, p.id);
            const status = rec?.status;
            const showCheckIn = status === "present" || status === "late";
            return (
              <li key={p.id} className="ic-attend__row">
                <div className="ic-attend__person">
                  <strong>{p.name}</strong>
                  <span>{p.role || "—"}</span>
                </div>
                <div className="ic-attend__status" role="group" aria-label={`Attendance for ${p.name}`}>
                  {ATTENDANCE_STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`ic-attend__btn ic-attend__btn--${s}${status === s ? " ic-attend__btn--on" : ""}`}
                      aria-pressed={status === s}
                      onClick={() => (status === s ? clearMark(p.id, date) : setStatus(p.id, date, s))}
                      title={status === s ? "Click again to clear" : ATTENDANCE_STATUS_META[s].label}
                    >
                      {ATTENDANCE_STATUS_META[s].label}
                    </button>
                  ))}
                </div>
                <div className="ic-attend__detail">
                  {showCheckIn ? (
                    <input
                      type="time"
                      className="ic-attend__time"
                      value={rec?.checkInAt ?? ""}
                      onChange={(e) => patch(p.id, date, { checkInAt: e.target.value })}
                      aria-label={`Check-in time for ${p.name}`}
                    />
                  ) : null}
                  <input
                    className="ic-attend__note"
                    value={rec?.note ?? ""}
                    onChange={(e) => patch(p.id, date, { note: e.target.value })}
                    placeholder="Note (optional)"
                    aria-label={`Attendance note for ${p.name}`}
                    disabled={!status}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
