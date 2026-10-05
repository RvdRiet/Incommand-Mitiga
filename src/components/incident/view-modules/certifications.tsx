"use client";

import { useMemo } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { useNow } from "@/lib/devices/presence";
import {
  certStatus,
  expiryLabel,
  CERT_STATUS_LABEL,
  type CertStatus,
} from "@/lib/incident/certifications";
import { IconAlertTriangle } from "@/components/ui/icons";

import { InlineInput, InlineSelect, RowDelete } from "../shared";
import { EmptyHint } from "../ui";

function statusRank(s: CertStatus): number {
  return ["expired", "expiring", "valid", "no-expiry"].indexOf(s);
}

export function CertificationsView() {
  const certifications = useIncidentStore((s) => s.certifications);
  const personnel = useIncidentStore((s) => s.personnel);
  const addCertification = useIncidentStore((s) => s.addCertification);
  const updateCertification = useIncidentStore((s) => s.updateCertification);
  const removeCertification = useIncidentStore((s) => s.removeCertification);
  const settings = useIncidentStore((s) => s.settings);
  const updateSettings = useIncidentStore((s) => s.updateSettings);
  const now = useNow(60000);

  const reminderDays = settings.certReminderDays ?? 30;

  const nameOf = (id: string | null) =>
    (id && personnel.find((p) => p.id === id)?.name) || "Unassigned";

  const personOptions = [
    { value: "", label: "— Unassigned —" },
    ...personnel.map((p) => ({ value: p.id, label: p.name || "(unnamed)" })),
  ];

  const enriched = useMemo(
    () =>
      certifications.map((c) => {
        const st = certStatus(c.expiresAt, now, reminderDays);
        return { cert: c, ...st };
      }),
    [certifications, now, reminderDays],
  );

  // Register: worst status first, then soonest expiry.
  const rows = useMemo(
    () =>
      [...enriched].sort(
        (a, b) =>
          statusRank(a.status) - statusRank(b.status) ||
          (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity),
      ),
    [enriched],
  );

  const due = rows.filter((r) => r.status === "expired" || r.status === "expiring");

  return (
    <section className="ic-roster-mod">
      <header className="ic-roster-mod__head">
        <div>
          <h2 className="ic-page-heading" style={{ padding: 0, border: 0 }}>
            Certifications &amp; qualifications
          </h2>
          <p className="ic-roster-mod__sub">
            Track crew competencies and their expiry dates. Certifications lapsing within the
            reminder window are flagged for renewal so no one deploys under‑qualified.
          </p>
        </div>
        <button type="button" className="ic-btn-add" onClick={() => addCertification()}>
          + Add certification
        </button>
      </header>

      <div className="ic-fatigue-rules">
        <span className="ic-fatigue-rules__label">Renewal reminder</span>
        <label>
          Flag when expiring within
          <input
            type="number"
            min={1}
            max={365}
            value={reminderDays}
            onChange={(e) => updateSettings({ certReminderDays: Number(e.target.value) })}
          />
          days
        </label>
      </div>

      {/* Renewals due */}
      {due.length > 0 ? (
        <>
          <h3 className="ic-roster__section-title">
            Renewals due
            <span className="ic-roster__flag-note">
              <IconAlertTriangle size={13} /> {due.length} to action
            </span>
          </h3>
          <ul className="ic-fatigue-list">
            {due.map((r) => (
              <li key={r.cert.id} className="ic-cert-due-row">
                <div className="ic-fatigue-row__who">
                  <b>{r.cert.name || "Untitled certification"}</b>
                  <span className="ic-fatigue-row__count">{nameOf(r.cert.personnelId)}</span>
                </div>
                <span className="ic-fatigue-row__reason">
                  {r.status === "expired" ? "Expired" : "Expires"} {expiryLabel(r.daysLeft)}
                  {r.cert.expiresAt ? ` · ${r.cert.expiresAt}` : ""}
                </span>
                <span className={`ic-cert-chip ic-cert-chip--${r.status}`}>
                  {CERT_STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Register */}
      <h3 className="ic-roster__section-title">Register</h3>
      <section className="ic-table-wrap ic-table-wrap--scroll">
        <table className="ic-table ic-cert-table">
          <thead>
            <tr>
              <th>Crew</th>
              <th>Certification</th>
              <th>Level</th>
              <th>Issuer</th>
              <th>Expires</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.cert;
              return (
                <tr key={c.id}>
                  <td>
                    <InlineSelect
                      value={c.personnelId ?? ""}
                      onChange={(v) => updateCertification(c.id, { personnelId: v || null })}
                      options={personOptions}
                    />
                  </td>
                  <td>
                    <InlineInput value={c.name} onChange={(v) => updateCertification(c.id, { name: v })} />
                  </td>
                  <td>
                    <InlineInput value={c.level} onChange={(v) => updateCertification(c.id, { level: v })} />
                  </td>
                  <td>
                    <InlineInput value={c.issuer} onChange={(v) => updateCertification(c.id, { issuer: v })} />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="ic-roster-dt"
                      value={c.expiresAt}
                      onChange={(e) => updateCertification(c.id, { expiresAt: e.target.value })}
                    />
                  </td>
                  <td>
                    <span className={`ic-cert-chip ic-cert-chip--${r.status}`}>
                      {CERT_STATUS_LABEL[r.status]}
                      {r.status === "expiring" || r.status === "expired" ? (
                        <span className="ic-cert-chip__days"> · {expiryLabel(r.daysLeft)}</span>
                      ) : null}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <RowDelete onClick={() => removeCertification(c.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <EmptyHint>
            No certifications recorded yet. Add one and set its expiry to start tracking renewals.
            Assign crew from the Personnel module.
          </EmptyHint>
        ) : null}
      </section>
    </section>
  );
}
