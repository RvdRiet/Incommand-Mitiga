"use client";

import { useMemo, useState } from "react";

import { toDateInput } from "@/lib/roster/attendance";
import { initials } from "@/lib/roster/photo";
import {
  SHIFT_STATUS_META,
  SHIFT_STATUS_ORDER,
  shiftHours,
  useOrgShifts,
  type OrgShift,
} from "@/lib/roster/shifts";
import { useOrgRoster } from "@/lib/roster/store";

/** Org-level master schedule: plan shifts against roster personnel. Feeds the in-event person view. */
export function RosterScheduling() {
  const people = useOrgRoster((s) => s.people);
  const shifts = useOrgShifts((s) => s.shifts);
  const addShift = useOrgShifts((s) => s.addShift);
  const updateShift = useOrgShifts((s) => s.updateShift);
  const removeShift = useOrgShifts((s) => s.removeShift);

  const [personId, setPersonId] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [filterPerson, setFilterPerson] = useState("");

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "(removed)";

  const add = () => {
    if (!personId) return;
    addShift(personId, { date, startTime: start, endTime: end, role: role.trim(), location: location.trim() });
    setRole("");
    setLocation("");
  };

  // Group by date ascending so the schedule reads as a forward-looking timeline.
  const grouped = useMemo(() => {
    const visible = filterPerson ? shifts.filter((s) => s.personId === filterPerson) : shifts;
    const byDate = new Map<string, OrgShift[]>();
    for (const s of visible) {
      const key = s.date || "(no date)";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(s);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, list]) => [d, list.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))] as const);
  }, [shifts, filterPerson]);

  const cycleStatus = (s: OrgShift) => {
    const i = SHIFT_STATUS_ORDER.indexOf(s.status);
    updateShift(s.id, { status: SHIFT_STATUS_ORDER[(i + 1) % SHIFT_STATUS_ORDER.length] });
  };

  const dateLabel = (d: string) => {
    if (d === "(no date)") return "No date set";
    const parsed = new Date(`${d}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return d;
    return parsed.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <section className="ic-roster__sched">
      {people.length === 0 ? (
        <p className="dev-registry__empty">
          Add people on the Roster tab first — shifts are scheduled against roster personnel.
        </p>
      ) : (
        <>
          <div className="dev-registry__card ic-roster__add">
            <h2>Schedule a shift</h2>
            <div className="ic-roster__sched-form">
              <label>
                Person
                <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  <option value="">Select…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Start
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label>
                End
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
              <label>
                Role <span className="dev-registry__opt">(optional)</span>
                <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Strike team lead" />
              </label>
              <label>
                Location <span className="dev-registry__opt">(optional)</span>
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sector 2" />
              </label>
            </div>
            <button type="button" className="ic-btn-add" onClick={add} disabled={!personId}>
              + Add shift
            </button>
          </div>

          {shifts.length > 0 && (
            <div className="ic-roster__sched-filter">
              <label>
                Show
                <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
                  <option value="">Everyone</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {grouped.length === 0 ? (
            <p className="dev-registry__empty">No shifts scheduled yet. Add one above.</p>
          ) : (
            grouped.map(([d, list]) => (
              <div key={d} className="ic-roster__sched-day">
                <h3 className="ic-roster__sched-date">{dateLabel(d)}</h3>
                <ul className="ic-roster__sched-list">
                  {list.map((s) => {
                    const meta = SHIFT_STATUS_META[s.status];
                    const hrs = shiftHours(s);
                    return (
                      <li key={s.id} className="ic-roster__shift">
                        <span className="ic-roster__shift-avatar" aria-hidden>
                          {initials(nameOf(s.personId))}
                        </span>
                        <div className="ic-roster__shift-main">
                          <span className="ic-roster__shift-name">{nameOf(s.personId)}</span>
                          <span className="ic-roster__shift-when">
                            {s.startTime || "—"}–{s.endTime || "—"}
                            {hrs > 0 ? ` · ${hrs}h` : ""}
                            {s.role ? ` · ${s.role}` : ""}
                            {s.location ? ` · ${s.location}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`ic-roster__shift-status ic-roster__shift-status--${meta.tone}`}
                          onClick={() => cycleStatus(s)}
                          title="Click to change status"
                        >
                          {meta.label}
                        </button>
                        <button
                          type="button"
                          className="dev-registry__remove"
                          title="Remove shift"
                          aria-label="Remove shift"
                          onClick={() => removeShift(s.id)}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}
