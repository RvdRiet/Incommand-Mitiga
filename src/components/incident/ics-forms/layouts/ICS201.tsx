"use client";

import {
  FemaIncidentHeader,
  FemaPageFooter,
  FemaPreparedBy,
  FemaShell,
  FemaTextArea,
  FemaField,
  FemaTable,
  useTableField,
} from "../primitives";

const RESOURCE_COLS = ["resource", "identifier", "ordered", "eta", "arrived", "notes"];
const RESOURCE_LABELS: Record<string, string> = {
  resource: "Resource",
  identifier: "Resource Identifier",
  ordered: "Date/Time Ordered",
  eta: "ETA",
  arrived: "Arrived",
  notes: "Notes (location/assignment/status)",
};

const ORG_POSITIONS = [
  "incidentCommander",
  "liaisonOfficer",
  "safetyOfficer",
  "publicInfoOfficer",
  "planningChief",
  "operationsChief",
  "logisticsChief",
  "financeChief",
] as const;

const ORG_LABELS: Record<(typeof ORG_POSITIONS)[number], string> = {
  incidentCommander: "Incident Commander(s)",
  liaisonOfficer: "Liaison Officer",
  safetyOfficer: "Safety Officer",
  publicInfoOfficer: "Public Information Officer",
  planningChief: "Planning Section Chief",
  operationsChief: "Operations Section Chief",
  logisticsChief: "Logistics Section Chief",
  financeChief: "Finance/Admin Section Chief",
};

export type FemaLayoutProps = {
  fields: Record<string, string>;
  setField: (id: string, v: string) => void;
};

export function ICS201Layout({ fields, setField }: FemaLayoutProps) {
  const resourceTable = useTableField(fields, "resourceRows", RESOURCE_COLS, 8, setField);

  return (
    <FemaShell title="INCIDENT BRIEFING (ICS 201)" subtitle="ICS 201" version="Version 3.0">
      <section className="fema-ics-form__page">
        <FemaIncidentHeader fields={fields} onChange={setField} />
        <FemaTextArea
          label="4. Map/Sketch (include sketch, showing the total area of operations, the incident site/area, impacted and threatened areas, overflight results, trajectories, impacted shorelines, or other graphics depicting situational status and resource assignment):"
          value={fields.mapSketch ?? ""}
          onChange={(v) => setField("mapSketch", v)}
          map
        />
        <FemaTextArea
          label="5. Situation Summary and Health and Safety Briefing (for briefings or transfer of command): Recognize potential incident Health and Safety Hazards and develop necessary measures (remove hazard, provide personal protective equipment, warn people of the hazard) to protect responders from those hazards."
          value={fields.situationSummary ?? ""}
          onChange={(v) => setField("situationSummary", v)}
          tall
        />
        <FemaPreparedBy fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 201" page={1} />
      </section>

      <section className="fema-ics-form__page">
        <FemaIncidentHeader fields={fields} onChange={setField} />
        <FemaTextArea
          label="7. Current and Planned Objectives:"
          value={fields.objectives ?? ""}
          onChange={(v) => setField("objectives", v)}
          tall
        />
        <FemaTextArea
          label="8. Current and Planned Actions, Strategies, and Tactics: — Time: Actions:"
          value={fields.actionsStrategies ?? ""}
          onChange={(v) => setField("actionsStrategies", v)}
          tall
        />
        <FemaPreparedBy fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 201" page={2} />
      </section>

      <section className="fema-ics-form__page">
        <FemaIncidentHeader fields={fields} onChange={setField} />
        <p className="fema-ics-form__block-title">
          9. Current Organization (fill in additional organization as appropriate):
        </p>
        <div className="fema-ics-form__org-grid">
          {ORG_POSITIONS.map((key) => (
            <div key={key} className="fema-ics-form__org-cell">
              {ORG_LABELS[key]}
              <input
                value={fields[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
                placeholder="Name"
                aria-label={ORG_LABELS[key]}
              />
            </div>
          ))}
        </div>
        <FemaPreparedBy fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 201" page={3} />
      </section>

      <section className="fema-ics-form__page">
        <FemaIncidentHeader fields={fields} onChange={setField} />
        <p className="fema-ics-form__block-title">10. Resource Summary:</p>
        <FemaTable
          columns={RESOURCE_COLS}
          columnLabels={RESOURCE_LABELS}
          rows={resourceTable.rows}
          minRows={8}
          onChange={resourceTable.onChange}
        />
        <FemaPreparedBy fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 201" page={4} />
      </section>
    </FemaShell>
  );
}
