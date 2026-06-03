"use client";

import { parseFormContent } from "@/lib/incident/ics-forms-catalog";
import type { IcsFormRecord } from "@/lib/incident/types";

import { IcsFemaForm } from "./ics-forms/IcsFemaForm";

type IcsFormEditorProps = {
  form: IcsFormRecord;
  onChange: (patch: { content: string; status?: IcsFormRecord["status"] }) => void;
};

export function IcsFormEditor({ form, onChange }: IcsFormEditorProps) {
  const { isStructured } = parseFormContent(form.content, form.templateId);

  if (form.templateId && isStructured) {
    return (
      <div className="ic-ics-form-fema-wrap">
        <IcsFemaForm form={form} onChange={onChange} />
      </div>
    );
  }

  return (
    <label className="ic-field ic-field--full">
      <span>Form content</span>
      <textarea
        rows={14}
        value={form.content}
        placeholder="ICS form fields and notes…"
        onChange={(e) => onChange({ content: e.target.value })}
      />
    </label>
  );
}
