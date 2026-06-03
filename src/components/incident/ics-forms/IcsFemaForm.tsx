"use client";

import {
  getIcsFormTemplate,
  parseFormContent,
  serializeFormFields,
} from "@/lib/incident/ics-forms-catalog";
import type { IcsFormRecord } from "@/lib/incident/types";

import { getFemaLayout } from "./layouts";

type IcsFemaFormProps = {
  form: IcsFormRecord;
  onChange: (patch: { content: string; status?: IcsFormRecord["status"] }) => void;
};

export function IcsFemaForm({ form, onChange }: IcsFemaFormProps) {
  const template = form.templateId ? getIcsFormTemplate(form.templateId) : undefined;
  const { fields, isStructured } = parseFormContent(form.content, form.templateId);

  const setField = (fieldId: string, value: string) => {
    if (!form.templateId) {
      onChange({ content: value });
      return;
    }
    const next = { ...fields, [fieldId]: value };
    onChange({ content: serializeFormFields(form.templateId, next) });
  };

  if (!template || !isStructured) {
    return null;
  }

  const Layout = getFemaLayout(form.templateId!);
  if (!Layout) return null;

  return <Layout fields={fields} setField={setField} />;
}
