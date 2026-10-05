"use client";

import { useState } from "react";

import { BackLink } from "@/components/ui/BackLink";
import { useOrgRoster, useOrgRosterHydrated } from "@/lib/roster/store";

import { AttendanceManager } from "./AttendanceManager";
import { RosterSyncBridge } from "./RosterSyncBridge";

type RosterTab = "roster" | "attendance";

export function RosterPage() {
  const hydrated = useOrgRosterHydrated();
  const people = useOrgRoster((s) => s.people);
  const addPerson = useOrgRoster((s) => s.addPerson);
  const updatePerson = useOrgRoster((s) => s.updatePerson);
  const removePerson = useOrgRoster((s) => s.removePerson);

  const [tab, setTab] = useState<RosterTab>("roster");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const add = () => {
    if (!name.trim()) return;
    addPerson({ name, role, team, phone, email });
    setName("");
    setRole("");
    setTeam("");
    setPhone("");
    setEmail("");
  };

  return (
    <div className="dev-registry ic-roster">
      <RosterSyncBridge />
      <header className="dev-registry__head">
        <BackLink href="/">Events</BackLink>
        <h1>Personnel Roster</h1>
        <p className="dev-registry__sub">
          Your organisation&apos;s master staff list. Add people once here, then drag them into any
          event&apos;s personnel from the event&apos;s Personnel module.
        </p>
      </header>

      <div className="ic-roster__tabs" role="tablist" aria-label="Roster views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "roster"}
          className={`ic-roster__tab${tab === "roster" ? " ic-roster__tab--active" : ""}`}
          onClick={() => setTab("roster")}
        >
          Roster {hydrated ? `(${people.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "attendance"}
          className={`ic-roster__tab${tab === "attendance" ? " ic-roster__tab--active" : ""}`}
          onClick={() => setTab("attendance")}
        >
          Attendance
        </button>
      </div>

      {tab === "attendance" ? (
        <AttendanceManager />
      ) : (
        <>
      <section className="dev-registry__register">
        <div className="dev-registry__card ic-roster__add">
          <h2>Add a person</h2>
          <div className="ic-roster__form">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </label>
            <label>
              Role
              <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Operations Section Chief" />
            </label>
            <label>
              Team <span className="dev-registry__opt">(optional)</span>
              <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Ops" />
            </label>
            <label>
              Phone <span className="dev-registry__opt">(optional)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27…" />
            </label>
            <label>
              Email <span className="dev-registry__opt">(optional)</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@org.gov" />
            </label>
          </div>
          <button type="button" className="ic-btn-add" onClick={add} disabled={!name.trim()}>
            + Add to roster
          </button>
        </div>
      </section>

      {!hydrated ? (
        <p className="dev-registry__empty">Loading…</p>
      ) : people.length === 0 ? (
        <p className="dev-registry__empty">No one on the roster yet. Add your staff above.</p>
      ) : (
        <ul className="ic-roster__list">
          {people.map((p) => (
            <li key={p.id} className="ic-roster__person">
              <div className="ic-roster__person-main">
                <input
                  className="ic-roster__name"
                  value={p.name}
                  onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                  aria-label="Name"
                />
                <input
                  className="ic-roster__role"
                  value={p.role}
                  onChange={(e) => updatePerson(p.id, { role: e.target.value })}
                  placeholder="Role"
                  aria-label="Role"
                />
              </div>
              <div className="ic-roster__person-meta">
                <input
                  value={p.team ?? ""}
                  onChange={(e) => updatePerson(p.id, { team: e.target.value })}
                  placeholder="Team"
                  aria-label="Team"
                />
                <input
                  value={p.phone ?? ""}
                  onChange={(e) => updatePerson(p.id, { phone: e.target.value })}
                  placeholder="Phone"
                  aria-label="Phone"
                />
                <input
                  value={p.email ?? ""}
                  onChange={(e) => updatePerson(p.id, { email: e.target.value })}
                  placeholder="Email"
                  aria-label="Email"
                />
              </div>
              <label className="ic-roster__experience">
                <span>Experience &amp; history</span>
                <textarea
                  value={p.experience ?? ""}
                  onChange={(e) => updatePerson(p.id, { experience: e.target.value })}
                  placeholder="Years of service, past deployments, qualifications gained, notable incidents…"
                  rows={2}
                  aria-label={`Experience and history for ${p.name}`}
                />
              </label>
              <button
                type="button"
                className="dev-registry__remove"
                title="Remove from roster"
                onClick={() => removePerson(p.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
        </>
      )}
    </div>
  );
}
