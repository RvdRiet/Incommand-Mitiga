"use client";

import type { ReactNode } from "react";

import {
  emptyRow,
  ensureRowCount,
  parseTableField,
  stringifyTableField,
  type IcsTableRow,
} from "@/lib/incident/ics-form-fields";

export type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "datetime-local" | "date" | "time";
  className?: string;
};

export function FemaField({
  label,
  value,
  onChange,
  type = "text",
  className,
}: FieldProps) {
  return (
    <div className={`fema-ics-form__field ${className ?? ""}`}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function FemaTextArea({
  label,
  value,
  onChange,
  tall,
  map,
}: FieldProps & { tall?: boolean; map?: boolean }) {
  return (
    <div className="fema-ics-form__field">
      <span>{label}</span>
      <textarea
        className={
          map
            ? "fema-ics-form__box fema-ics-form__box--map"
            : tall
              ? "fema-ics-form__box fema-ics-form__box--tall"
              : "fema-ics-form__box"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function FemaPreparedBy({
  blockNumber = "6",
  fields,
  onChange,
}: {
  blockNumber?: string;
  fields: Record<string, string>;
  onChange: (id: string, v: string) => void;
}) {
  return (
    <div className="fema-ics-form__prepared">
      <span className="fema-ics-form__prepared-label" style={{ gridColumn: "1 / -1" }}>
        {blockNumber}. Prepared by:
      </span>
      <FemaField
        label="Name:"
        value={fields.preparedName ?? ""}
        onChange={(v) => onChange("preparedName", v)}
      />
      <FemaField
        label="Position/Title:"
        value={fields.preparedPosition ?? ""}
        onChange={(v) => onChange("preparedPosition", v)}
      />
      <FemaField
        label="Signature:"
        value={fields.preparedSignature ?? ""}
        onChange={(v) => onChange("preparedSignature", v)}
      />
      <FemaField
        label="Date/Time:"
        value={fields.preparedDateTime ?? ""}
        onChange={(v) => onChange("preparedDateTime", v)}
        type="datetime-local"
      />
    </div>
  );
}

export function FemaPageFooter({ formId, page }: { formId: string; page: number }) {
  return (
    <footer className="fema-ics-form__page-footer">
      <span>
        {formId}, Page {page}
      </span>
      <span>Date/Time:</span>
    </footer>
  );
}

export function FemaShell({
  title,
  subtitle,
  version,
  children,
}: {
  title: string;
  subtitle: string;
  version: string;
  children: ReactNode;
}) {
  return (
    <article className="fema-ics-form">
      <header className="fema-ics-form__banner">
        <h1>{title}</h1>
        <div className="fema-ics-form__banner-meta">
          <span>{subtitle}</span>
          <span>{version}</span>
        </div>
      </header>
      {children}
    </article>
  );
}

export function FemaIncidentHeader({
  fields,
  onChange,
  showIncidentNumber = true,
}: {
  fields: Record<string, string>;
  onChange: (id: string, v: string) => void;
  showIncidentNumber?: boolean;
}) {
  return (
    <div
      className={`fema-ics-form__row ${showIncidentNumber ? "fema-ics-form__row--3" : "fema-ics-form__row--2"}`}
    >
      <FemaField
        label="1. Incident Name:"
        value={fields.incidentName ?? ""}
        onChange={(v) => onChange("incidentName", v)}
      />
      {showIncidentNumber ? (
        <FemaField
          label="2. Incident Number:"
          value={fields.incidentNumber ?? ""}
          onChange={(v) => onChange("incidentNumber", v)}
        />
      ) : null}
      <div className="fema-ics-form__field">
        <span>{showIncidentNumber ? "3. Date/Time Initiated:" : "2. Date/Time Initiated:"}</span>
        <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
          <FemaField
            label="Date:"
            value={fields.dateInitiated ?? ""}
            onChange={(v) => onChange("dateInitiated", v)}
            type="date"
          />
          <FemaField
            label="Time:"
            value={fields.timeInitiated ?? ""}
            onChange={(v) => onChange("timeInitiated", v)}
            type="time"
          />
        </div>
      </div>
    </div>
  );
}

export function FemaOpPeriodHeader({
  fields,
  onChange,
}: {
  fields: Record<string, string>;
  onChange: (id: string, v: string) => void;
}) {
  return (
    <div className="fema-ics-form__row fema-ics-form__row--2">
      <FemaField
        label="1. Incident Name:"
        value={fields.incidentName ?? ""}
        onChange={(v) => onChange("incidentName", v)}
      />
      <div className="fema-ics-form__field">
        <span>2. Operational Period:</span>
        <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
          <FemaField
            label="Date From:"
            value={fields.opDateFrom ?? ""}
            onChange={(v) => onChange("opDateFrom", v)}
            type="date"
          />
          <FemaField
            label="Date To:"
            value={fields.opDateTo ?? ""}
            onChange={(v) => onChange("opDateTo", v)}
            type="date"
          />
        </div>
        <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
          <FemaField
            label="Time From:"
            value={fields.opTimeFrom ?? ""}
            onChange={(v) => onChange("opTimeFrom", v)}
            type="time"
          />
          <FemaField
            label="Time To:"
            value={fields.opTimeTo ?? ""}
            onChange={(v) => onChange("opTimeTo", v)}
            type="time"
          />
        </div>
      </div>
    </div>
  );
}

export function FemaTable({
  columns,
  columnLabels,
  rows,
  minRows,
  onChange,
}: {
  columns: string[];
  columnLabels: Record<string, string>;
  rows: IcsTableRow[];
  minRows: number;
  onChange: (rows: IcsTableRow[]) => void;
}) {
  const data = ensureRowCount(rows, minRows, columns);

  const updateCell = (rowIndex: number, col: string, value: string) => {
    const next = data.map((r, i) => (i === rowIndex ? { ...r, [col]: value } : r));
    onChange(next);
  };

  const addRow = () => onChange([...data, emptyRow(columns)]);
  const removeRow = (index: number) => {
    if (data.length <= 1) return;
    onChange(data.filter((_, i) => i !== index));
  };

  return (
    <div className="fema-ics-form__table-wrap">
      <table className="fema-ics-form__table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{columnLabels[col] ?? col}</th>
            ))}
            <th aria-label="Actions" style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>
                  {col === "arrived" || col === "required" ? (
                    <input
                      type="checkbox"
                      checked={row[col] === "X" || row[col] === "x" || row[col] === "1"}
                      onChange={(e) => updateCell(i, col, e.target.checked ? "X" : "")}
                      aria-label="Arrived"
                    />
                  ) : (
                    <input
                      value={row[col] ?? ""}
                      onChange={(e) => updateCell(i, col, e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td>
                <button type="button" onClick={() => removeRow(i)} title="Remove row">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fema-ics-form__table-actions">
        <button type="button" onClick={addRow}>
          + Add row
        </button>
      </div>
    </div>
  );
}

export function useTableField(
  fields: Record<string, string>,
  fieldId: string,
  columns: string[],
  minRows: number,
  setField: (id: string, v: string) => void,
) {
  const rows = parseTableField(fields[fieldId], columns);
  const onChange = (next: IcsTableRow[]) => setField(fieldId, stringifyTableField(next));
  return { rows: ensureRowCount(rows, minRows, columns), onChange };
}
