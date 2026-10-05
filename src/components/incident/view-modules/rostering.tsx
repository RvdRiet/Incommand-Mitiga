"use client";

import { useMemo } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { useNow } from "@/lib/devices/presence";
import {
  computeFatigue,
  shiftHours,
  FATIGUE_LABEL,
  type FatigueLevel,
} from "@/lib/incident/fatigue";
import { IconAlertTriangle } from "@/components/ui/icons";

import { InlineInput, InlineSelect, RowDelete } from "../shared";
import { EmptyHint } from "../ui";

/** ISO → the value a <input type="datetime-local"> expects, in the viewer's local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
/** datetime-local value (local time) → ISO (UTC) for storage. */
function fromLocalInput(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
function fmtHrs(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
function rank(l: FatigueLevel): number {
  return ["rested", "on-duty", "warning", "critical"].indexOf(l);
}

export function RosteringView() {
  const shifts = useIncidentStore((s) => s.shifts);
  const personnel = useIncidentStore((s) => s.personnel);
  const addShift = useIncidentStore((s) => s.addShift);
  const updateShift = useIncidentStore((s) => s.updateShift);
  const removeShift = useIncidentStore((s) => s.removeShift);
  const settings = useIncidentStore((s) => s.settings);
  const updateSettings = useIncidentStore((s) => s.updateSettings);
  const now = useNow(30000);

  const rules = {
    maxShiftHours: settings.maxShiftHours ?? 12,
    maxOnDuty24h: settings.maxOnDuty24h ?? 16,
    minRestHours: settings.minRestHours ?? 8,
  };

  const nameOf = (id: string | null) =>
    (id && personnel.find((p) => p.id === id)?.name) || "Unassigned";

  const personOptions = [
    { value: "", label: "— Unassigned —" },
    ...personnel.map((p) => ({ value: p.id, label: p.name || "(unnamed)" })),
  ];

  // Group shifts per person and compute a live fatigue snapshot; most fatigued first.
  const crew = useMemo(() => {
    const byPerson = new Map<string, typeof shifts>();
    for (const sh of shifts) {
      const key = sh.personnelId ?? "__unassigned__";
      const list = byPerson.get(key) ?? [];
      list.push(sh);
      byPerson.set(key, list);
    }
    return [...byPerson.entries()]
      .map(([key, list]) => ({
        key,
        name: key === "__unassigned__" ? "Unassigned" : nameOf(key),
        fatigue: computeFatigue(list, rules, now),
        shiftCount: list.length,
      }))
      .sort((a, b) => rank(b.fatigue.level) - rank(a.fatigue.level) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, personnel, rules.maxShiftHours, rules.maxOnDuty24h, rules.minRestHours, now]);

  const sortedShifts = useMemo(
    () => [...shifts].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [shifts],
  );

  const flagged = crew.filter((c) => c.fatigue.level === "warning" || c.fatigue.level === "critical");

  return (
    <section className="ic-roster-mod">
      <header className="ic-roster-mod__head">
        <div>
          <h2 className="ic-page-heading" style={{ padding: 0, border: 0 }}>
            Rostering &amp; fatigue
          </h2>
          <p className="ic-roster-mod__sub">
            Schedule crew onto shifts and watch on-duty hours against fatigue limits so nobody is
            deployed past a safe threshold.
          </p>
        </div>
        <button type="button" className="ic-btn-add" onClick={() => addShift()}>
          + Add shift
        </button>
      </header>

      {/* Fatigue limits */}
      <div className="ic-fatigue-rules">
        <span className="ic-fatigue-rules__label">Fatigue limits</span>
        <label>
          Max shift
          <input
            type="number"
            min={1}
            max={48}
            value={rules.maxShiftHours}
            onChange={(e) => updateSettings({ maxShiftHours: Number(e.target.value) })}
          />
          h
        </label>
        <label>
          Max in 24 h
          <input
            type="number"
            min={1}
            max={24}
            value={rules.maxOnDuty24h}
            onChange={(e) => updateSettings({ maxOnDuty24h: Number(e.target.value) })}
          />
          h
        </label>
        <label>
          Min rest
          <input
            type="number"
            min={0}
            max={48}
            value={rules.minRestHours}
            onChange={(e) => updateSettings({ minRestHours: Number(e.target.value) })}
          />
          h
        </label>
      </div>

      {/* Crew fatigue summary */}
      {crew.length > 0 ? (
        <>
          <h3 className="ic-roster__section-title">
            Crew status
            {flagged.length > 0 ? (
              <span className="ic-roster__flag-note">
                <IconAlertTriangle size={13} /> {flagged.length} need attention
              </span>
            ) : null}
          </h3>
          <ul className="ic-fatigue-list">
            {crew.map((c) => {
              const f = c.fatigue;
              return (
                <li key={c.key} className="ic-fatigue-row">
                  <div className="ic-fatigue-row__who">
                    <b>{c.name}</b>
                    <span className="ic-fatigue-row__count">
                      {c.shiftCount} shift{c.shiftCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="ic-fatigue-row__metrics">
                    <span>
                      24 h <b>{fmtHrs(f.hours24h)}</b>
                    </span>
                    <span>
                      on shift <b>{f.onDutyNow ? fmtHrs(f.currentShiftHours) : "—"}</b>
                    </span>
                    <span>
                      rest <b>{f.restHours == null ? "—" : fmtHrs(f.restHours)}</b>
                    </span>
                  </div>
                  {f.reasons.length > 0 ? (
                    <span className="ic-fatigue-row__reason">{f.reasons[0]}</span>
                  ) : (
                    <span className="ic-fatigue-row__reason ic-fatigue-row__reason--ok">
                      Within limits
                    </span>
                  )}
                  <span className={`ic-fatigue-chip ic-fatigue-chip--${f.level}`}>
                    {FATIGUE_LABEL[f.level]}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {/* Shifts */}
      <h3 className="ic-roster__section-title">Shifts</h3>
      <section className="ic-table-wrap ic-table-wrap--scroll">
        <table className="ic-table ic-roster-table">
          <thead>
            <tr>
              <th>Crew</th>
              <th>Role</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sortedShifts.map((sh) => (
              <tr key={sh.id}>
                <td>
                  <InlineSelect
                    value={sh.personnelId ?? ""}
                    onChange={(v) => updateShift(sh.id, { personnelId: v || null })}
                    options={personOptions}
                  />
                </td>
                <td>
                  <InlineInput
                    value={sh.role}
                    onChange={(v) => updateShift(sh.id, { role: v })}
                  />
                </td>
                <td>
                  <input
                    type="datetime-local"
                    className="ic-roster-dt"
                    value={toLocalInput(sh.startsAt)}
                    onChange={(e) => updateShift(sh.id, { startsAt: fromLocalInput(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="datetime-local"
                    className="ic-roster-dt"
                    value={toLocalInput(sh.endsAt)}
                    onChange={(e) => updateShift(sh.id, { endsAt: fromLocalInput(e.target.value) })}
                  />
                </td>
                <td className="ic-roster-table__dur">{fmtHrs(shiftHours(sh))}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <RowDelete onClick={() => removeShift(sh.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedShifts.length === 0 ? (
          <EmptyHint>
            No shifts rostered yet. Add one to start tracking crew hours and fatigue. Assign crew
            from the Personnel module.
          </EmptyHint>
        ) : null}
      </section>
    </section>
  );
}
