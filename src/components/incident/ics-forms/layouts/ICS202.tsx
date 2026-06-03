"use client";

import {
  FemaField,
  FemaOpPeriodHeader,
  FemaPageFooter,
  FemaPreparedBy,
  FemaShell,
  FemaTextArea,
} from "../primitives";
import type { FemaLayoutProps } from "./ICS201";

const IAP_ATTACHMENTS = [
  { id: "iap203", label: "ICS 203" },
  { id: "iap204", label: "ICS 204" },
  { id: "iap205", label: "ICS 205" },
  { id: "iap205a", label: "ICS 205A" },
  { id: "iap206", label: "ICS 206" },
  { id: "iap207", label: "ICS 207" },
  { id: "iap208", label: "ICS 208" },
  { id: "iapMap", label: "Map/Chart" },
  { id: "iapWeather", label: "Weather Forecast/Tides/Currents" },
] as const;

export function ICS202Layout({ fields, setField }: FemaLayoutProps) {
  const toggle = (id: string) => setField(id, fields[id] === "1" ? "" : "1");

  return (
    <FemaShell title="INCIDENT OBJECTIVES (ICS 202)" subtitle="ICS 202" version="Version 3.0">
      <section className="fema-ics-form__page">
        <FemaOpPeriodHeader fields={fields} onChange={setField} />
        <FemaTextArea
          label="3. Objective(s):"
          value={fields.objectives ?? ""}
          onChange={(v) => setField("objectives", v)}
          tall
        />
        <FemaTextArea
          label="4. Operational Period Command Emphasis:"
          value={fields.commandEmphasis ?? ""}
          onChange={(v) => setField("commandEmphasis", v)}
        />
        <FemaTextArea
          label="General Situational Awareness"
          value={fields.situationalAwareness ?? ""}
          onChange={(v) => setField("situationalAwareness", v)}
        />
        <div className="fema-ics-form__field">
          <span>5. Site Safety Plan Required?</span>
          <div className="fema-ics-form__checkboxes" style={{ gridTemplateColumns: "auto auto" }}>
            <label>
              <input
                type="checkbox"
                checked={fields.siteSafetyYes === "1"}
                onChange={() => {
                  setField("siteSafetyYes", fields.siteSafetyYes === "1" ? "" : "1");
                  if (fields.siteSafetyNo === "1") setField("siteSafetyNo", "");
                }}
              />
              Yes
            </label>
            <label>
              <input
                type="checkbox"
                checked={fields.siteSafetyNo === "1"}
                onChange={() => {
                  setField("siteSafetyNo", fields.siteSafetyNo === "1" ? "" : "1");
                  if (fields.siteSafetyYes === "1") setField("siteSafetyYes", "");
                }}
              />
              No
            </label>
          </div>
        </div>
        <FemaField
          label="Approved Site Safety Plan(s) Located at:"
          value={fields.siteSafetyLocation ?? ""}
          onChange={(v) => setField("siteSafetyLocation", v)}
        />
        <p className="fema-ics-form__block-title">
          6. Incident Action Plan (the items checked below are included in this Incident Action Plan):
        </p>
        <div className="fema-ics-form__iap-grid fema-ics-form__checkboxes">
          {IAP_ATTACHMENTS.map(({ id, label }) => (
            <label key={id}>
              <input type="checkbox" checked={fields[id] === "1"} onChange={() => toggle(id)} />
              {label}
            </label>
          ))}
        </div>
        <FemaField
          label="Other Attachments:"
          value={fields.iapOther ?? ""}
          onChange={(v) => setField("iapOther", v)}
        />
        <FemaPreparedBy blockNumber="7" fields={fields} onChange={setField} />
        <div className="fema-ics-form__prepared" style={{ marginTop: 8 }}>
          <span className="fema-ics-form__prepared-label" style={{ gridColumn: "1 / -1" }}>
            8. Approved by Incident Commander:
          </span>
          <FemaField
            label="Name:"
            value={fields.approvedName ?? ""}
            onChange={(v) => setField("approvedName", v)}
          />
          <FemaField
            label="Signature:"
            value={fields.approvedSignature ?? ""}
            onChange={(v) => setField("approvedSignature", v)}
          />
          <FemaField
            label="Date/Time:"
            value={fields.approvedDateTime ?? ""}
            onChange={(v) => setField("approvedDateTime", v)}
            type="datetime-local"
          />
        </div>
        <FemaPageFooter formId="ICS 202 IAP Page _____" page={1} />
      </section>
    </FemaShell>
  );
}
