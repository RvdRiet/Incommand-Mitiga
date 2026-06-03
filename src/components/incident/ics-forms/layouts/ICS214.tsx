"use client";

import {
  FemaField,
  FemaOpPeriodHeader,
  FemaPageFooter,
  FemaPreparedBy,
  FemaShell,
  FemaTable,
  useTableField,
} from "../primitives";
import type { FemaLayoutProps } from "./ICS201";

const RESOURCE_COLS = ["name", "icsPosition", "homeAgency"];
const RESOURCE_LABELS: Record<string, string> = {
  name: "Name",
  icsPosition: "ICS Position",
  homeAgency: "Home Agency (and Unit)",
};

const ACTIVITY_COLS = ["dateTime", "notableActivities"];
const ACTIVITY_LABELS: Record<string, string> = {
  dateTime: "Date/Time",
  notableActivities: "Notable Activities",
};

export function ICS214Layout({ fields, setField }: FemaLayoutProps) {
  const resources = useTableField(fields, "resourceRows", RESOURCE_COLS, 4, setField);
  const activities = useTableField(fields, "activityRows", ACTIVITY_COLS, 12, setField);
  const activitiesCont = useTableField(fields, "activityRowsCont", ACTIVITY_COLS, 12, setField);

  return (
    <FemaShell title="ACTIVITY LOG (ICS 214)" subtitle="ICS 214" version="Version 3.1">
      <section className="fema-ics-form__page">
        <FemaOpPeriodHeader fields={fields} onChange={setField} />
        <FemaField
          label="3. Name:"
          value={fields.unitName ?? ""}
          onChange={(v) => setField("unitName", v)}
        />
        <FemaField
          label="4. ICS Position:"
          value={fields.icsPosition ?? ""}
          onChange={(v) => setField("icsPosition", v)}
        />
        <FemaField
          label="5. Home Agency (and Unit):"
          value={fields.homeAgency ?? ""}
          onChange={(v) => setField("homeAgency", v)}
        />
        <p className="fema-ics-form__block-title">6. Resources Assigned:</p>
        <FemaTable
          columns={RESOURCE_COLS}
          columnLabels={RESOURCE_LABELS}
          rows={resources.rows}
          minRows={4}
          onChange={resources.onChange}
        />
        <p className="fema-ics-form__block-title">7. Activity Log:</p>
        <FemaTable
          columns={ACTIVITY_COLS}
          columnLabels={ACTIVITY_LABELS}
          rows={activities.rows}
          minRows={12}
          onChange={activities.onChange}
        />
        <FemaPreparedBy blockNumber="8" fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 214, Page 1" page={1} />
      </section>
      <section className="fema-ics-form__page">
        <FemaOpPeriodHeader fields={fields} onChange={setField} />
        <p className="fema-ics-form__block-title">7. Activity Log (continuation):</p>
        <FemaTable
          columns={ACTIVITY_COLS}
          columnLabels={ACTIVITY_LABELS}
          rows={activitiesCont.rows}
          minRows={12}
          onChange={activitiesCont.onChange}
        />
        <FemaPreparedBy blockNumber="8" fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 214, Page 2" page={2} />
      </section>
    </FemaShell>
  );
}
