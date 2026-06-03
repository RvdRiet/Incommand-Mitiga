"use client";

import type { IcsFormTemplate } from "@/lib/incident/ics-forms-catalog";

import {
  FemaField,
  FemaPageFooter,
  FemaPreparedBy,
  FemaShell,
  FemaTextArea,
} from "../primitives";
import type { FemaLayoutProps } from "./ICS201";

export function FemaGenericLayout({
  fields,
  setField,
  template,
}: FemaLayoutProps & { template: IcsFormTemplate }) {
  return (
    <FemaShell
      title={template.title.toUpperCase()}
      subtitle={template.id}
      version={template.version}
    >
      <section className="fema-ics-form__page">
        {template.sections.map((section) => (
          <div key={section.id}>
            {section.title ? (
              <p className="fema-ics-form__block-title">{section.title}</p>
            ) : null}
            {section.fields.map((field) =>
              field.type === "textarea" ? (
                <FemaTextArea
                  key={field.id}
                  label={field.label}
                  value={fields[field.id] ?? ""}
                  onChange={(v) => setField(field.id, v)}
                  tall={Boolean(field.rows && field.rows > 4)}
                />
              ) : (
                <FemaField
                  key={field.id}
                  label={field.label}
                  value={fields[field.id] ?? ""}
                  onChange={(v) => setField(field.id, v)}
                  type={field.type === "datetime" ? "datetime-local" : "text"}
                />
              ),
            )}
          </div>
        ))}
        {(fields.preparedName ?? fields.preparedPosition) ? (
          <FemaPreparedBy fields={fields} onChange={setField} />
        ) : null}
        <FemaPageFooter formId={template.id} page={1} />
      </section>
    </FemaShell>
  );
}
