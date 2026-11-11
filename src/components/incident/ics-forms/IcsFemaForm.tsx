"use client";

import { useIncidentStore } from "@/context/EventContext";
import { deriveLinkedFields } from "@/lib/incident/ics-form-links";
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

  // Linked ICS forms: shared fields auto-populate from live incident data.
  const situation = useIncidentStore((s) => s.situation);
  const operationalPeriods = useIncidentStore((s) => s.operationalPeriods);
  const roleGroups = useIncidentStore((s) => s.roleGroups);
  const personnel = useIncidentStore((s) => s.personnel);

  const setField = (fieldId: string, value: string) => {
    if (!form.templateId) {
      onChange({ content: value });
      return;
    }
    // Write only the user's explicit edits; untouched fields stay linked to the incident.
    const next = { ...fields, [fieldId]: value };
    onChange({ content: serializeFormFields(form.templateId, next) });
  };

  if (!template || !isStructured) {
    return null;
  }

  const Layout = getFemaLayout(form.templateId!);
  if (!Layout) return null;

  // Derived values fill empty fields; any non-empty saved edit always wins. (New
  // forms are scaffolded with every field as "", so a plain spread would let those
  // empty strings mask the linked values — hence the explicit emptiness check.)
  const linked = deriveLinkedFields({ situation, operationalPeriods, roleGroups, personnel });
  const mergedFields = { ...fields };
  for (const [fieldId, value] of Object.entries(linked)) {
    if (!mergedFields[fieldId]?.trim()) mergedFields[fieldId] = value;
  }

  return <Layout fields={mergedFields} setField={setField} />;
}
