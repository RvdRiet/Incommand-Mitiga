"use client";

import { FemaOpPeriodHeader, FemaPageFooter, FemaPreparedBy, FemaShell } from "../primitives";
import type { FemaLayoutProps } from "./ICS201";

const COMMAND_STAFF = [
  { id: "ic", label: "Incident Commander(s)" },
  { id: "deputyIc", label: "Deputy" },
  { id: "safety", label: "Safety Officer" },
  { id: "info", label: "Information Officer" },
  { id: "liaison", label: "Liaison Officer" },
] as const;

const SECTIONS = [
  { block: "7", title: "Operations Section:", prefix: "ops" },
  { block: "8", title: "Planning Section:", prefix: "plan" },
  { block: "9", title: "Logistics Section:", prefix: "log" },
  { block: "10", title: "Finance/Administration Section:", prefix: "fin" },
] as const;

const SECTION_ROLES = [
  "Chief",
  "Deputy",
  "Branch I",
  "Branch II",
  "Branch III",
  "Branch IV",
  "Branch V",
] as const;

export function ICS203Layout({ fields, setField }: FemaLayoutProps) {
  return (
    <FemaShell
      title="ORGANIZATION ASSIGNMENT LIST (ICS 203)"
      subtitle="ICS 203"
      version="Version 3.0"
    >
      <section className="fema-ics-form__page">
        <FemaOpPeriodHeader fields={fields} onChange={setField} />
        <p className="fema-ics-form__block-title">
          3. Incident Commander(s) and Command Staff:
        </p>
        <div className="fema-ics-form__org-grid">
          {COMMAND_STAFF.map(({ id, label }) => (
            <div key={id} className="fema-ics-form__org-cell">
              {label}
              <input
                value={fields[id] ?? ""}
                onChange={(e) => setField(id, e.target.value)}
                aria-label={label}
              />
            </div>
          ))}
        </div>
        {SECTIONS.map(({ block, title, prefix }) => (
          <div key={prefix}>
            <p className="fema-ics-form__block-title">
              {block}. {title}
            </p>
            <div className="fema-ics-form__org-grid">
              {SECTION_ROLES.map((role) => {
                const key = `${prefix}_${role.replace(/\s+/g, "")}`;
                return (
                  <div key={key} className="fema-ics-form__org-cell">
                    {role}
                    <input
                      value={fields[key] ?? ""}
                      onChange={(e) => setField(key, e.target.value)}
                      aria-label={`${title} ${role}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <FemaPreparedBy blockNumber="11" fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 203 IAP Page _____" page={1} />
      </section>
    </FemaShell>
  );
}
