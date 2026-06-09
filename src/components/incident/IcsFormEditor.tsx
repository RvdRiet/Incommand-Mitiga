"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

import { parseFormContent } from "@/lib/incident/ics-forms-catalog";
import type { IcsFormRecord } from "@/lib/incident/types";

import { IcsFemaForm } from "./ics-forms/IcsFemaForm";

export type IcsFormEditorHandle = {
  getExportRoot: () => HTMLElement | null;
};

type IcsFormEditorProps = {
  form: IcsFormRecord;
  onChange: (patch: { content: string; status?: IcsFormRecord["status"] }) => void;
};

export const IcsFormEditor = forwardRef<IcsFormEditorHandle, IcsFormEditorProps>(
  function IcsFormEditor({ form, onChange }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const { isStructured } = parseFormContent(form.content, form.templateId);

    useImperativeHandle(ref, () => ({
      getExportRoot: () => wrapRef.current,
    }));

    if (form.templateId && isStructured) {
      return (
        <div ref={wrapRef} className="ic-ics-form-fema-wrap">
          <IcsFemaForm form={form} onChange={onChange} />
        </div>
      );
    }

    return (
      <div ref={wrapRef}>
        <label className="ic-field ic-field--full">
          <span>Form content</span>
          <textarea
            rows={14}
            value={form.content}
            placeholder="ICS form fields and notes…"
            onChange={(e) => onChange({ content: e.target.value })}
          />
        </label>
      </div>
    );
  },
);
