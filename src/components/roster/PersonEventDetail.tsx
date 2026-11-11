"use client";

import { useMemo } from "react";

import { daysUntilExpiry, useOrgQualifications } from "@/lib/roster/qualifications";
import { initials } from "@/lib/roster/photo";
import { recentShiftsFor, shiftHours, SHIFT_STATUS_META, useOrgShifts } from "@/lib/roster/shifts";
import { useOrgRoster } from "@/lib/roster/store";

/**
 * In-event read-only view of a person, resolved live from the org roster by `orgPersonId`.
 * Shows photo, qualifications (with renewal flags) and the 3 most recent shifts — so edits
 * made on the org hub show through here. Rendered when a linked Personnel row is expanded.
 */
export function PersonEventDetail({ orgPersonId }: { orgPersonId: string }) {
  const person = useOrgRoster((s) => s.people.find((p) => p.id === orgPersonId));
  const quals = useOrgQualifications((s) => s.quals);
  const shifts = useOrgShifts((s) => s.shifts);

  const myQuals = useMemo(() => quals.filter((q) => q.personId === orgPersonId), [quals, orgPersonId]);
  const recent = useMemo(() => recentShiftsFor(shifts, orgPersonId, 3), [shifts, orgPersonId]);

  if (!person) {
    return (
      <p className="ic-person-detail__missing">
        This person&apos;s roster record is no longer available. It may have been removed from the
        org roster.
      </p>
    );
  }

  const fmtDate = (d: string) => {
    if (!d) return "—";
    const parsed = new Date(`${d}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return d;
    return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="ic-person-detail">
      <div className="ic-person-detail__head">
        {person.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photo} alt={person.name} className="ic-person-detail__photo" />
        ) : (
          <span className="ic-person-detail__photo ic-person-detail__photo--initials">
            {initials(person.name)}
          </span>
        )}
        <div className="ic-person-detail__id">
          <span className="ic-person-detail__name">{person.name}</span>
          {person.role ? <span className="ic-person-detail__role">{person.role}</span> : null}
          <span className="ic-person-detail__meta">
            {person.team ? `${person.team}` : ""}
            {person.phone ? `${person.team ? " · " : ""}${person.phone}` : ""}
          </span>
        </div>
        <span className="ic-person-detail__linked" title="Live-linked to the org roster">
          ⬡ Roster-linked
        </span>
      </div>

      {person.experience ? (
        <p className="ic-person-detail__experience">{person.experience}</p>
      ) : null}

      <div className="ic-person-detail__cols">
        <section className="ic-person-detail__col">
          <h4 className="ic-person-detail__h">Qualifications ({myQuals.length})</h4>
          {myQuals.length === 0 ? (
            <p className="ic-person-detail__none">None recorded.</p>
          ) : (
            <ul className="ic-person-detail__quals">
              {myQuals.map((q) => {
                const d = daysUntilExpiry(q.expiresAt);
                const flag =
                  d === null ? null : d < 0 ? "expired" : d <= 30 ? `${d}d left` : null;
                const flagClass =
                  d === null ? "" : d < 0 ? " ic-person-detail__flag--past" : d <= 30 ? " ic-person-detail__flag--soon" : "";
                return (
                  <li key={q.id} className="ic-person-detail__qual">
                    <span className="ic-person-detail__qual-name">{q.name || "(unnamed)"}</span>
                    {q.level ? <span className="ic-person-detail__qual-level">{q.level}</span> : null}
                    {flag ? (
                      <span className={`ic-person-detail__flag${flagClass}`}>{flag}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ic-person-detail__col">
          <h4 className="ic-person-detail__h">Recent shifts</h4>
          {recent.length === 0 ? (
            <p className="ic-person-detail__none">No shifts on the org schedule.</p>
          ) : (
            <ul className="ic-person-detail__shifts">
              {recent.map((s) => {
                const hrs = shiftHours(s);
                return (
                  <li key={s.id} className="ic-person-detail__shift">
                    <span className="ic-person-detail__shift-date">{fmtDate(s.date)}</span>
                    <span className="ic-person-detail__shift-time">
                      {s.startTime || "—"}–{s.endTime || "—"}
                      {hrs > 0 ? ` · ${hrs}h` : ""}
                      {s.role ? ` · ${s.role}` : ""}
                    </span>
                    <span className="ic-person-detail__shift-status">
                      {SHIFT_STATUS_META[s.status].label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
