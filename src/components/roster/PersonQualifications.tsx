"use client";

import { useMemo, useState } from "react";

import { daysUntilExpiry, useOrgQualifications } from "@/lib/roster/qualifications";

/** Per-person qualifications editor, shown on the roster person card (org-level). */
export function PersonQualifications({ personId }: { personId: string }) {
  const quals = useOrgQualifications((s) => s.quals);
  const addQual = useOrgQualifications((s) => s.addQual);
  const updateQual = useOrgQualifications((s) => s.updateQual);
  const removeQual = useOrgQualifications((s) => s.removeQual);
  const [open, setOpen] = useState(false);

  const mine = useMemo(
    () => quals.filter((q) => q.personId === personId),
    [quals, personId],
  );

  return (
    <div className="ic-roster__quals">
      <button
        type="button"
        className="ic-roster__quals-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾" : "▸"} Qualifications ({mine.length})
        {mine.some((q) => {
          const d = daysUntilExpiry(q.expiresAt);
          return d !== null && d <= 30;
        }) ? (
          <span className="ic-roster__quals-flag" title="A qualification is expiring soon or expired">
            renewal due
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="ic-roster__quals-body">
          {mine.map((q) => {
            const d = daysUntilExpiry(q.expiresAt);
            const expiryClass =
              d === null ? "" : d < 0 ? " ic-roster__qual-expiry--past" : d <= 30 ? " ic-roster__qual-expiry--soon" : "";
            return (
              <div key={q.id} className="ic-roster__qual">
                <input
                  className="ic-roster__qual-name"
                  value={q.name}
                  placeholder="Qualification (e.g. Advanced Life Support)"
                  onChange={(e) => updateQual(q.id, { name: e.target.value })}
                  aria-label="Qualification name"
                />
                <input
                  value={q.level}
                  placeholder="Level"
                  onChange={(e) => updateQual(q.id, { level: e.target.value })}
                  aria-label="Level"
                />
                <input
                  value={q.issuer}
                  placeholder="Issuer"
                  onChange={(e) => updateQual(q.id, { issuer: e.target.value })}
                  aria-label="Issuer"
                />
                <label className="ic-roster__qual-date">
                  <span>Issued</span>
                  <input
                    type="date"
                    value={q.issuedAt}
                    onChange={(e) => updateQual(q.id, { issuedAt: e.target.value })}
                    aria-label="Issued date"
                  />
                </label>
                <label className={`ic-roster__qual-date${expiryClass}`}>
                  <span>Expires</span>
                  <input
                    type="date"
                    value={q.expiresAt}
                    onChange={(e) => updateQual(q.id, { expiresAt: e.target.value })}
                    aria-label="Expiry date"
                  />
                </label>
                <input
                  value={q.reference}
                  placeholder="Ref / cert no."
                  onChange={(e) => updateQual(q.id, { reference: e.target.value })}
                  aria-label="Reference"
                />
                <button
                  type="button"
                  className="dev-registry__remove"
                  title="Remove qualification"
                  aria-label="Remove qualification"
                  onClick={() => removeQual(q.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button type="button" className="ic-btn-add ic-roster__qual-add" onClick={() => addQual(personId)}>
            + Add qualification
          </button>
        </div>
      ) : null}
    </div>
  );
}
