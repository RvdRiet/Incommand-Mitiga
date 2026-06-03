"use client";

import type { IcsFormBlockSpec, IcsFormSpec } from "@/lib/incident/ics-form-specs/types";

import {
  FemaField,
  FemaIncidentHeader,
  FemaOpPeriodHeader,
  FemaPageFooter,
  FemaPreparedBy,
  FemaShell,
  FemaTable,
  FemaTextArea,
  useTableField,
} from "./primitives";

export function FemaSpecRenderer({
  spec,
  fields,
  setField,
}: {
  spec: IcsFormSpec;
  fields: Record<string, string>;
  setField: (id: string, v: string) => void;
}) {
  return (
    <FemaShell title={spec.title} subtitle={spec.subtitle} version={spec.version}>
      {spec.pages.map((page) => (
        <section key={page.page} className="fema-ics-form__page">
          {page.blocks.map((block, i) => (
            <SpecBlock key={`${page.page}-${i}`} block={block} fields={fields} setField={setField} />
          ))}
          <FemaPageFooter formId={page.footerLabel} page={page.page} />
        </section>
      ))}
    </FemaShell>
  );
}

function SpecBlock({
  block,
  fields,
  setField,
}: {
  block: IcsFormBlockSpec;
  fields: Record<string, string>;
  setField: (id: string, v: string) => void;
}) {
  switch (block.type) {
    case "incidentHeader":
      return <FemaIncidentHeader fields={fields} onChange={setField} />;
    case "incidentNameNumber":
      return (
        <div className="fema-ics-form__row fema-ics-form__row--2">
          <FemaField
            label="1. Incident Name:"
            value={fields.incidentName ?? ""}
            onChange={(v) => setField("incidentName", v)}
          />
          <FemaField
            label="2. Incident Number:"
            value={fields.incidentNumber ?? ""}
            onChange={(v) => setField("incidentNumber", v)}
          />
        </div>
      );
    case "incidentNameOnly":
      return (
        <FemaField
          label="1. Incident Name:"
          value={fields.incidentName ?? ""}
          onChange={(v) => setField("incidentName", v)}
        />
      );
    case "opPeriod":
      return <FemaOpPeriodHeader fields={fields} onChange={setField} />;
    case "opPeriodOnly":
      return (
        <div className="fema-ics-form__field">
          <span>{block.block ?? "2"}. Operational Period:</span>
          <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
            <FemaField
              label="Date From:"
              value={fields.opDateFrom ?? ""}
              onChange={(v) => setField("opDateFrom", v)}
              type="date"
            />
            <FemaField
              label="Date To:"
              value={fields.opDateTo ?? ""}
              onChange={(v) => setField("opDateTo", v)}
              type="date"
            />
          </div>
          <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
            <FemaField
              label="Time From:"
              value={fields.opTimeFrom ?? ""}
              onChange={(v) => setField("opTimeFrom", v)}
              type="time"
            />
            <FemaField
              label="Time To:"
              value={fields.opTimeTo ?? ""}
              onChange={(v) => setField("opTimeTo", v)}
              type="time"
            />
          </div>
        </div>
      );
    case "dateTimePrepared":
      return (
        <div className="fema-ics-form__row fema-ics-form__row--2">
          <FemaField
            label={`${block.block ?? "2"}. Date/Time Prepared:`}
            value={fields.datePrepared ?? ""}
            onChange={(v) => setField("datePrepared", v)}
            type="date"
          />
          <FemaField
            label="Time:"
            value={fields.timePrepared ?? ""}
            onChange={(v) => setField("timePrepared", v)}
            type="time"
          />
        </div>
      );
    case "field":
      return (
        <FemaField
          label={`${block.block}. ${block.label}`}
          value={fields[block.fieldId] ?? ""}
          onChange={(v) => setField(block.fieldId, v)}
          type={block.input}
        />
      );
    case "textarea":
      return (
        <FemaTextArea
          label={`${block.block}. ${block.label}`}
          value={fields[block.fieldId] ?? ""}
          onChange={(v) => setField(block.fieldId, v)}
          tall={block.tall}
          map={block.map}
        />
      );
    case "row":
      return (
        <div
          className={`fema-ics-form__row fema-ics-form__row--${Math.min(block.fields.length, 4) as 2 | 3 | 4}`}
        >
          {block.fields.map((f) => (
            <FemaField
              key={f.fieldId}
              label={f.block ? `${f.block}. ${f.label}` : f.label}
              value={fields[f.fieldId] ?? ""}
              onChange={(v) => setField(f.fieldId, v)}
              type={f.input}
            />
          ))}
        </div>
      );
    case "table":
      return <SpecTable block={block} fields={fields} setField={setField} />;
    case "orgGrid":
      return (
        <>
          <p className="fema-ics-form__block-title">
            {block.block}. {block.label}
          </p>
          <div className="fema-ics-form__org-grid">
            {block.positions.map(({ id, label }) => (
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
        </>
      );
    case "yesNo":
      return (
        <div className="fema-ics-form__field">
          <span>
            {block.block}. {block.label}
          </span>
          <div className="fema-ics-form__checkboxes" style={{ gridTemplateColumns: "auto auto" }}>
            <label>
              <input
                type="checkbox"
                checked={fields[block.yesId] === "1"}
                onChange={() => {
                  setField(block.yesId, fields[block.yesId] === "1" ? "" : "1");
                  if (fields[block.noId] === "1") setField(block.noId, "");
                }}
              />
              Yes
            </label>
            <label>
              <input
                type="checkbox"
                checked={fields[block.noId] === "1"}
                onChange={() => {
                  setField(block.noId, fields[block.noId] === "1" ? "" : "1");
                  if (fields[block.yesId] === "1") setField(block.yesId, "");
                }}
              />
              No
            </label>
          </div>
        </div>
      );
    case "checkboxes":
      return (
        <>
          <p className="fema-ics-form__block-title">
            {block.block}. {block.label}
          </p>
          <div
            className="fema-ics-form__checkboxes"
            style={{
              gridTemplateColumns: block.columns === 1 ? "1fr" : "1fr 1fr",
            }}
          >
            {block.items.map(({ id, label }) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={fields[id] === "1"}
                  onChange={() => setField(id, fields[id] === "1" ? "" : "1")}
                />
                {label}
              </label>
            ))}
          </div>
        </>
      );
    case "preparedBy":
      return <FemaPreparedBy blockNumber={block.block ?? "6"} fields={fields} onChange={setField} />;
    case "dualSignoff":
      return (
        <div className="fema-ics-form__prepared">
          <span className="fema-ics-form__prepared-label" style={{ gridColumn: "1 / -1" }}>
            {block.block}. {block.primary.role} / {block.secondary.role}
          </span>
          <FemaField
            label={`${block.primary.role} Name:`}
            value={fields[block.primary.nameId] ?? ""}
            onChange={(v) => setField(block.primary.nameId, v)}
          />
          <FemaField
            label="Signature:"
            value={fields[block.primary.sigId] ?? ""}
            onChange={(v) => setField(block.primary.sigId, v)}
          />
          <FemaField
            label={`${block.secondary.role} Name:`}
            value={fields[block.secondary.nameId] ?? ""}
            onChange={(v) => setField(block.secondary.nameId, v)}
          />
          <FemaField
            label="Signature:"
            value={fields[block.secondary.sigId] ?? ""}
            onChange={(v) => setField(block.secondary.sigId, v)}
          />
        </div>
      );
    case "approval":
      return (
        <div className="fema-ics-form__prepared">
          <span className="fema-ics-form__prepared-label" style={{ gridColumn: "1 / -1" }}>
            {block.block}. {block.label}
          </span>
          <FemaField
            label="Name:"
            value={fields[block.nameId] ?? ""}
            onChange={(v) => setField(block.nameId, v)}
          />
          <FemaField
            label="Signature:"
            value={fields[block.sigId] ?? ""}
            onChange={(v) => setField(block.sigId, v)}
          />
          {block.dateId ? (
            <FemaField
              label="Date/Time:"
              value={fields[block.dateId] ?? ""}
              onChange={(v) => setField(block.dateId!, v)}
              type="datetime-local"
            />
          ) : null}
        </div>
      );
    case "sectionTitle":
      return <p className="fema-ics-form__block-title">{block.title}</p>;
    case "hint":
      return (
        <p className="fema-ics-form__block-title" style={{ fontWeight: 400, fontStyle: "italic" }}>
          {block.text}
        </p>
      );
    default:
      return null;
  }
}

function SpecTable({
  block,
  fields,
  setField,
}: {
  block: Extract<IcsFormBlockSpec, { type: "table" }>;
  fields: Record<string, string>;
  setField: (id: string, v: string) => void;
}) {
  const table = useTableField(fields, block.fieldId, block.columns, block.minRows, setField);
  return (
    <>
      {block.label ? (
        <p className="fema-ics-form__block-title">
          {block.block}. {block.label}
        </p>
      ) : (
        <p className="fema-ics-form__block-title">{block.block}.</p>
      )}
      <FemaTable
        columns={block.columns}
        columnLabels={block.columnLabels}
        rows={table.rows}
        minRows={block.minRows}
        onChange={table.onChange}
      />
    </>
  );
}
