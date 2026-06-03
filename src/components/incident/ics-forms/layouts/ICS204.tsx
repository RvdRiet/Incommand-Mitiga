"use client";

import {
  FemaField,
  FemaOpPeriodHeader,
  FemaPageFooter,
  FemaPreparedBy,
  FemaShell,
  FemaTable,
  FemaTextArea,
  useTableField,
} from "../primitives";
import type { FemaLayoutProps } from "./ICS201";

const RESOURCE_COLS = [
  "identifier",
  "leader",
  "persons",
  "contact",
  "reportingNotes",
];
const RESOURCE_LABELS: Record<string, string> = {
  identifier: "Resource Identifier",
  leader: "Leader",
  persons: "# of Persons",
  contact: "Contact (e.g., phone, pager, radio frequency, etc.)",
  reportingNotes:
    "Reporting Location, Special Equipment and Supplies, Remarks, Notes, Information",
};

const COMM_COLS = ["nameFunction", "primaryContact"];
const COMM_LABELS: Record<string, string> = {
  nameFunction: "Name/Function",
  primaryContact:
    "Primary Contact: indicate cell, pager, or radio (frequency/system/channel)",
};

export function ICS204Layout({ fields, setField }: FemaLayoutProps) {
  const resources = useTableField(fields, "resourceRows", RESOURCE_COLS, 4, setField);
  const comms = useTableField(fields, "commRows", COMM_COLS, 4, setField);

  return (
    <FemaShell title="ASSIGNMENT LIST (ICS 204)" subtitle="ICS 204" version="Version 3.0">
      <section className="fema-ics-form__page">
        <FemaOpPeriodHeader fields={fields} onChange={setField} />
        <div className="fema-ics-form__row fema-ics-form__row--4">
          <FemaField
            label="3. Branch:"
            value={fields.branch ?? ""}
            onChange={(v) => setField("branch", v)}
          />
          <FemaField
            label="Division:"
            value={fields.division ?? ""}
            onChange={(v) => setField("division", v)}
          />
          <FemaField
            label="Group:"
            value={fields.group ?? ""}
            onChange={(v) => setField("group", v)}
          />
          <FemaField
            label="Staging Area:"
            value={fields.stagingArea ?? ""}
            onChange={(v) => setField("stagingArea", v)}
          />
        </div>
        <p className="fema-ics-form__block-title">4. Operations Personnel: Name — Contact Number(s)</p>
        <div className="fema-ics-form__row fema-ics-form__row--3">
          <FemaField
            label="Operations Section Chief:"
            value={fields.opsChief ?? ""}
            onChange={(v) => setField("opsChief", v)}
          />
          <FemaField
            label="Branch Director:"
            value={fields.branchDirector ?? ""}
            onChange={(v) => setField("branchDirector", v)}
          />
          <FemaField
            label="Division/Group Supervisor:"
            value={fields.divisionSupervisor ?? ""}
            onChange={(v) => setField("divisionSupervisor", v)}
          />
        </div>
        <p className="fema-ics-form__block-title">5. Resources Assigned:</p>
        <FemaTable
          columns={RESOURCE_COLS}
          columnLabels={RESOURCE_LABELS}
          rows={resources.rows}
          minRows={4}
          onChange={resources.onChange}
        />
        <FemaTextArea
          label="6. Work Assignments:"
          value={fields.workAssignments ?? ""}
          onChange={(v) => setField("workAssignments", v)}
          tall
        />
        <FemaTextArea
          label="7. Special Instructions:"
          value={fields.specialInstructions ?? ""}
          onChange={(v) => setField("specialInstructions", v)}
        />
        <p className="fema-ics-form__block-title">
          8. Communications (radio and/or phone contact numbers needed for this assignment):
        </p>
        <FemaTable
          columns={COMM_COLS}
          columnLabels={COMM_LABELS}
          rows={comms.rows}
          minRows={4}
          onChange={comms.onChange}
        />
        <FemaPreparedBy blockNumber="9" fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 204 IAP Page _____" page={1} />
      </section>
    </FemaShell>
  );
}
