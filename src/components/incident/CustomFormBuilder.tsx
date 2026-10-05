"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { useIncidentStore } from "@/context/EventContext";
import type {
  CustomForm,
  CustomFormField,
  CustomFormFieldType,
  CustomFormResponse,
} from "@/lib/incident/types";
import { formatDate } from "./shared";

/** The drag-and-drop component palette (order = the order they appear). */
const PALETTE: { type: CustomFormFieldType; label: string; hint: string }[] = [
  { type: "text", label: "Short text", hint: "Single line" },
  { type: "textarea", label: "Long text", hint: "Paragraph" },
  { type: "number", label: "Number", hint: "Numeric value" },
  { type: "date", label: "Date", hint: "Date picker" },
  { type: "checkbox", label: "Yes / No", hint: "Single toggle" },
  { type: "select", label: "Dropdown", hint: "Pick one" },
  { type: "radio", label: "Multiple choice", hint: "Pick one" },
  { type: "checklist", label: "Checklist", hint: "Tick many" },
  { type: "section", label: "Section", hint: "Heading" },
  { type: "paragraph", label: "Text block", hint: "Instructions" },
];

const TYPE_LABEL: Record<CustomFormFieldType, string> =
  Object.fromEntries(PALETTE.map((p) => [p.type, p.label])) as Record<CustomFormFieldType, string>;

const NEEDS_OPTIONS = (t: CustomFormFieldType) => t === "select" || t === "radio" || t === "checklist";
const IS_LAYOUT = (t: CustomFormFieldType) => t === "section" || t === "paragraph";

type DragPayload =
  | { source: "palette"; fieldType: CustomFormFieldType }
  | { source: "canvas"; fieldId: string };

export function CustomFormBuilder({ formId }: { formId: string }) {
  const form = useIncidentStore((s) => s.customForms.find((f) => f.id === formId) ?? null);
  const [mode, setMode] = useState<"build" | "fill">("build");

  if (!form) return <p className="ic-empty-hint">Form not found.</p>;

  return (
    <div className="ic-cfb">
      <BuilderHeader form={form} mode={mode} onMode={setMode} />
      {mode === "build" ? <BuildCanvas form={form} /> : <FillView form={form} />}
    </div>
  );
}

function BuilderHeader({
  form,
  mode,
  onMode,
}: {
  form: CustomForm;
  mode: "build" | "fill";
  onMode: (m: "build" | "fill") => void;
}) {
  const update = useIncidentStore((s) => s.updateCustomForm);
  return (
    <header className="ic-cfb__head">
      <div className="ic-cfb__head-main">
        <input
          className="ic-cfb__title"
          value={form.name}
          onChange={(e) => update(form.id, { name: e.target.value })}
          aria-label="Form name"
          placeholder="Untitled form"
        />
        <input
          className="ic-cfb__desc"
          value={form.description ?? ""}
          onChange={(e) => update(form.id, { description: e.target.value })}
          aria-label="Description"
          placeholder="Add a short description (optional)"
        />
      </div>
      <div className="ic-cfb__head-controls">
        <label className="ic-field ic-field--compact">
          <span>Type</span>
          <select
            value={form.kind}
            onChange={(e) => update(form.id, { kind: e.target.value as CustomForm["kind"] })}
          >
            <option value="form">Form</option>
            <option value="survey">Survey</option>
            <option value="checklist">Checklist</option>
          </select>
        </label>
        <label className="ic-field ic-field--compact">
          <span>Status</span>
          <select
            value={form.status}
            onChange={(e) => update(form.id, { status: e.target.value as CustomForm["status"] })}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
        <div className="ic-cfb__mode" role="tablist" aria-label="Editor mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "build"}
            className={`ic-cfb__mode-btn${mode === "build" ? " ic-cfb__mode-btn--on" : ""}`}
            onClick={() => onMode("build")}
          >
            Build
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "fill"}
            className={`ic-cfb__mode-btn${mode === "fill" ? " ic-cfb__mode-btn--on" : ""}`}
            onClick={() => onMode("fill")}
          >
            Preview &amp; fill
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─────────────────────────── Build mode ─────────────────────────── */

function BuildCanvas({ form }: { form: CustomForm }) {
  const addField = useIncidentStore((s) => s.addCustomFormField);
  const moveField = useIncidentStore((s) => s.moveCustomFormField);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDropAt = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    setDropIndex(null);
    let payload: DragPayload | null = null;
    try {
      payload = JSON.parse(e.dataTransfer.getData("application/json")) as DragPayload;
    } catch {
      return;
    }
    if (!payload) return;
    if (payload.source === "palette") addField(form.id, payload.fieldType, index);
    else moveField(form.id, payload.fieldId, index);
  };

  return (
    <div className="ic-cfb__body">
      <aside className="ic-cfb__palette" aria-label="Components">
        <p className="ic-cfb__palette-title">Components</p>
        <p className="ic-cfb__palette-hint">Drag onto the form, or click to add.</p>
        {PALETTE.map((p) => (
          <button
            key={p.type}
            type="button"
            className="ic-cfb__palette-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(
                "application/json",
                JSON.stringify({ source: "palette", fieldType: p.type } satisfies DragPayload),
              );
            }}
            onClick={() => addField(form.id, p.type)}
          >
            <span className="ic-cfb__palette-label">{p.label}</span>
            <span className="ic-cfb__palette-sub">{p.hint}</span>
          </button>
        ))}
      </aside>

      <section
        className="ic-cfb__canvas"
        aria-label="Form layout"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDropAt(form.fields.length, e)}
      >
        {form.fields.length === 0 ? (
          <div
            className="ic-cfb__dropzone ic-cfb__dropzone--empty"
            onDragOver={(e) => {
              e.preventDefault();
              setDropIndex(0);
            }}
            onDrop={(e) => handleDropAt(0, e)}
          >
            Drag a component here to start building, or click one on the left.
          </div>
        ) : (
          form.fields.map((field, i) => (
            <div key={field.id}>
              <DropLine active={dropIndex === i} onOver={() => setDropIndex(i)} onDrop={(e) => handleDropAt(i, e)} />
              <FieldCard
                form={form}
                field={field}
                index={i}
                total={form.fields.length}
                onDragIndex={setDropIndex}
                onDropAt={handleDropAt}
              />
            </div>
          ))
        )}
        {form.fields.length > 0 ? (
          <DropLine
            active={dropIndex === form.fields.length}
            onOver={() => setDropIndex(form.fields.length)}
            onDrop={(e) => handleDropAt(form.fields.length, e)}
          />
        ) : null}
      </section>
    </div>
  );
}

function DropLine({
  active,
  onOver,
  onDrop,
}: {
  active: boolean;
  onOver: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className={`ic-cfb__dropline${active ? " ic-cfb__dropline--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        onOver();
      }}
      onDrop={onDrop}
    />
  );
}

function FieldCard({
  form,
  field,
  index,
  total,
  onDragIndex,
  onDropAt,
}: {
  form: CustomForm;
  field: CustomFormField;
  index: number;
  total: number;
  onDragIndex: (i: number | null) => void;
  onDropAt: (index: number, e: React.DragEvent) => void;
}) {
  const update = useIncidentStore((s) => s.updateCustomFormField);
  const remove = useIncidentStore((s) => s.removeCustomFormField);
  const move = useIncidentStore((s) => s.moveCustomFormField);
  const patch = (p: Partial<CustomFormField>) => update(form.id, field.id, p);

  return (
    <div
      className="ic-cfb__field"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({ source: "canvas", fieldId: field.id } satisfies DragPayload),
        );
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onDragIndex(e.clientY - r.top < r.height / 2 ? index : index + 1);
      }}
      onDrop={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onDropAt(e.clientY - r.top < r.height / 2 ? index : index + 1, e);
      }}
    >
      <div className="ic-cfb__field-bar">
        <span className="ic-cfb__grip" title="Drag to reorder" aria-hidden>
          ⋮⋮
        </span>
        <span className="ic-cfb__field-type">{TYPE_LABEL[field.type]}</span>
        <div className="ic-cfb__field-actions">
          <button
            type="button"
            className="ic-cfb__mini"
            disabled={index === 0}
            title="Move up"
            onClick={() => move(form.id, field.id, index - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="ic-cfb__mini"
            disabled={index === total - 1}
            title="Move down"
            onClick={() => move(form.id, field.id, index + 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="ic-cfb__mini ic-cfb__mini--danger"
            title="Remove"
            aria-label="Remove field"
            onClick={() => remove(form.id, field.id)}
          >
            ×
          </button>
        </div>
      </div>

      <input
        className="ic-cfb__label-input"
        value={field.label}
        onChange={(e) => patch({ label: e.target.value })}
        placeholder={field.type === "section" ? "Section heading" : "Question / label"}
        aria-label="Field label"
      />

      {!IS_LAYOUT(field.type) ? (
        <div className="ic-cfb__field-opts">
          {(field.type === "text" || field.type === "textarea" || field.type === "number") ? (
            <input
              className="ic-cfb__sub-input"
              value={field.placeholder ?? ""}
              onChange={(e) => patch({ placeholder: e.target.value })}
              placeholder="Placeholder (optional)"
              aria-label="Placeholder"
            />
          ) : null}
          <input
            className="ic-cfb__sub-input"
            value={field.helpText ?? ""}
            onChange={(e) => patch({ helpText: e.target.value })}
            placeholder="Help text (optional)"
            aria-label="Help text"
          />
          <label className="ic-cfb__required">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => patch({ required: e.target.checked })}
            />
            Required
          </label>
        </div>
      ) : null}

      {NEEDS_OPTIONS(field.type) ? <OptionsEditor form={form} field={field} /> : null}
    </div>
  );
}

function OptionsEditor({ form, field }: { form: CustomForm; field: CustomFormField }) {
  const update = useIncidentStore((s) => s.updateCustomFormField);
  const options = field.options ?? [];
  const setOptions = (next: string[]) => update(form.id, field.id, { options: next });

  return (
    <div className="ic-cfb__options">
      <span className="ic-cfb__options-label">Options</span>
      {options.map((opt, i) => (
        <div key={i} className="ic-cfb__option-row">
          <input
            className="ic-cfb__sub-input"
            value={opt}
            onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
            aria-label={`Option ${i + 1}`}
          />
          <button
            type="button"
            className="ic-cfb__mini ic-cfb__mini--danger"
            title="Remove option"
            disabled={options.length <= 1}
            onClick={() => setOptions(options.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ic-btn-secondary ic-btn-secondary--sm"
        onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
      >
        + Add option
      </button>
    </div>
  );
}

/* ─────────────────────────── Fill mode ─────────────────────────── */

type FillValue = string | string[] | boolean;

function FillView({ form }: { form: CustomForm }) {
  const { data: session } = useSession();
  const addResponse = useIncidentStore((s) => s.addCustomFormResponse);
  const [values, setValues] = useState<Record<string, FillValue>>({});
  const [submittedBy, setSubmittedBy] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answerable = useMemo(() => form.fields.filter((f) => !IS_LAYOUT(f.type)), [form.fields]);

  const setVal = (id: string, v: FillValue) => setValues((prev) => ({ ...prev, [id]: v }));

  const submit = () => {
    setNotice(null);
    // Required-field validation.
    for (const f of answerable) {
      if (!f.required) continue;
      const v = values[f.id];
      const empty =
        v == null ||
        v === "" ||
        v === false ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        setError(`"${f.label}" is required.`);
        return;
      }
    }
    setError(null);
    const who = submittedBy.trim() || session?.user?.name || session?.user?.email || "Operator";
    addResponse(form.id, {
      submittedAt: new Date().toISOString(),
      submittedBy: who,
      values: values as CustomFormResponse["values"],
    });
    setValues({});
    setNotice("Response saved.");
  };

  return (
    <div className="ic-cfb__fill">
      <form
        className="ic-cfb__fill-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {form.fields.length === 0 ? (
          <p className="ic-empty-hint">This form has no fields yet — switch to Build to add some.</p>
        ) : null}
        {form.fields.map((field) => (
          <FillField key={field.id} field={field} value={values[field.id]} onChange={(v) => setVal(field.id, v)} />
        ))}

        {form.fields.length > 0 ? (
          <div className="ic-cfb__fill-submit">
            <label className="ic-field ic-field--compact">
              <span>Your name</span>
              <input
                type="text"
                value={submittedBy}
                placeholder={session?.user?.email ?? "Operator"}
                onChange={(e) => setSubmittedBy(e.target.value)}
              />
            </label>
            <button type="submit" className="ic-btn-add">
              Submit response
            </button>
            {error ? <span className="ic-cfb__fill-error">{error}</span> : null}
            {notice ? <span className="ic-cfb__fill-ok">{notice}</span> : null}
          </div>
        ) : null}
      </form>

      <ResponsesPanel form={form} />
    </div>
  );
}

function FillField({
  field,
  value,
  onChange,
}: {
  field: CustomFormField;
  value: FillValue | undefined;
  onChange: (v: FillValue) => void;
}) {
  if (field.type === "section") return <h4 className="ic-cfb__fill-section">{field.label}</h4>;
  if (field.type === "paragraph") return <p className="ic-cfb__fill-para">{field.label}</p>;

  const label = (
    <span className="ic-cfb__fill-label">
      {field.label}
      {field.required ? <span className="ic-cfb__req" aria-hidden> *</span> : null}
    </span>
  );
  const help = field.helpText ? <span className="ic-cfb__fill-help">{field.helpText}</span> : null;
  const options = field.options ?? [];

  if (field.type === "textarea") {
    return (
      <label className="ic-cfb__fill-field">
        {label}
        {help}
        <textarea
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="ic-cfb__fill-field ic-cfb__fill-field--inline">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {label}
        {help}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="ic-cfb__fill-field">
        {label}
        {help}
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {options.map((o, i) => (
            <option key={i} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "radio") {
    return (
      <fieldset className="ic-cfb__fill-field ic-cfb__fill-choices">
        <legend>{label}</legend>
        {help}
        {options.map((o, i) => (
          <label key={i} className="ic-cfb__choice">
            <input
              type="radio"
              name={field.id}
              checked={value === o}
              onChange={() => onChange(o)}
            />
            {o}
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.type === "checklist") {
    const arr = Array.isArray(value) ? value : [];
    const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
    return (
      <fieldset className="ic-cfb__fill-field ic-cfb__fill-choices">
        <legend>{label}</legend>
        {help}
        {options.map((o, i) => (
          <label key={i} className="ic-cfb__choice">
            <input type="checkbox" checked={arr.includes(o)} onChange={() => toggle(o)} />
            {o}
          </label>
        ))}
      </fieldset>
    );
  }
  // text / number / date
  return (
    <label className="ic-cfb__fill-field">
      {label}
      {help}
      <input
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ResponsesPanel({ form }: { form: CustomForm }) {
  const remove = useIncidentStore((s) => s.removeCustomFormResponse);
  if (form.responses.length === 0) {
    return (
      <aside className="ic-cfb__responses">
        <p className="ic-cfb__responses-title">Responses</p>
        <p className="ic-empty-hint">No responses yet.</p>
      </aside>
    );
  }
  return (
    <aside className="ic-cfb__responses">
      <p className="ic-cfb__responses-title">Responses ({form.responses.length})</p>
      {form.responses
        .slice()
        .reverse()
        .map((r) => (
          <div key={r.id} className="ic-cfb__response">
            <div className="ic-cfb__response-head">
              <strong>{r.submittedBy}</strong>
              <span>{formatDate(r.submittedAt)}</span>
              <button
                type="button"
                className="ic-cfb__mini ic-cfb__mini--danger"
                title="Delete response"
                onClick={() => remove(form.id, r.id)}
              >
                ×
              </button>
            </div>
            <dl className="ic-cfb__response-body">
              {form.fields
                .filter((f) => !IS_LAYOUT(f.type))
                .map((f) => {
                  const v = r.values[f.id];
                  const text = Array.isArray(v)
                    ? v.join(", ")
                    : typeof v === "boolean"
                      ? v
                        ? "Yes"
                        : "No"
                      : (v ?? "—");
                  return (
                    <div key={f.id} className="ic-cfb__response-row">
                      <dt>{f.label}</dt>
                      <dd>{text || "—"}</dd>
                    </div>
                  );
                })}
            </dl>
          </div>
        ))}
    </aside>
  );
}
