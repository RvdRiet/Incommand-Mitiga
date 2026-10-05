import { jsPDF } from "jspdf";

import type { CustomForm, CustomFormField } from "./types";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "form"
  );
}

const KIND_LABEL: Record<CustomForm["kind"], string> = {
  form: "Form",
  survey: "Survey",
  checklist: "Checklist",
};

const isLayout = (t: CustomFormField["type"]) => t === "section" || t === "paragraph";

function answerText(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v == null || v === "") return "—";
  return String(v);
}

/** Download the form definition + all responses as JSON. */
export function downloadCustomFormJson(form: CustomForm): string {
  const filename = `${KIND_LABEL[form.kind].toLowerCase()}-${slugify(form.name)}.json`;
  const blob = new Blob([JSON.stringify(form, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
  return filename;
}

/**
 * Render the form (its structure and any collected responses) to a clean,
 * text-based letter-size PDF. Returns { filename, blob } so the caller can also
 * archive it to server storage.
 */
export function customFormToPdf(form: CustomForm): { filename: string; blob: Blob } {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const write = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number; indent?: number } = {},
  ) => {
    const size = opts.size ?? 11;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? [17, 24, 39]));
    const indent = opts.indent ?? 0;
    const lines = doc.splitTextToSize(text, maxW - indent) as string[];
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin + indent, y);
      y += size + 4;
    }
    y += opts.gap ?? 0;
  };

  // Header
  write(form.name || "Untitled form", { size: 18, bold: true });
  write(`${KIND_LABEL[form.kind]} · ${form.status}`, { size: 10, color: [107, 114, 128], gap: 6 });
  if (form.description) write(form.description, { size: 11, color: [55, 65, 81], gap: 6 });

  // Structure
  doc.setDrawColor(226, 232, 240);
  ensureSpace(20);
  doc.line(margin, y, pageW - margin, y);
  y += 16;
  write("Fields", { size: 13, bold: true, gap: 4 });

  if (form.fields.length === 0) {
    write("No fields.", { color: [107, 114, 128], gap: 6 });
  } else {
    form.fields.forEach((f, i) => {
      if (f.type === "section") {
        write(f.label, { size: 12, bold: true, gap: 2 });
        return;
      }
      if (f.type === "paragraph") {
        write(f.label, { size: 10, color: [107, 114, 128], gap: 2 });
        return;
      }
      const flags = [f.type, f.required ? "required" : null].filter(Boolean).join(", ");
      write(`${i + 1}. ${f.label}  (${flags})`, { size: 11, bold: true });
      if (f.helpText) write(f.helpText, { size: 9, color: [107, 114, 128], indent: 14 });
      if (f.options && f.options.length) write(`Options: ${f.options.join(", ")}`, { size: 9, color: [107, 114, 128], indent: 14, gap: 2 });
    });
  }

  // Responses
  if (form.responses.length > 0) {
    const answerable = form.fields.filter((f) => !isLayout(f.type));
    y += 8;
    ensureSpace(20);
    doc.line(margin, y, pageW - margin, y);
    y += 16;
    write(`Responses (${form.responses.length})`, { size: 13, bold: true, gap: 4 });
    form.responses.forEach((r, i) => {
      write(`#${i + 1} · ${r.submittedBy} · ${r.submittedAt.slice(0, 16).replace("T", " ")}`, {
        size: 10,
        bold: true,
        color: [37, 99, 235],
        gap: 2,
      });
      answerable.forEach((f) => {
        write(`${f.label}: ${answerText(r.values[f.id])}`, { size: 10, indent: 14 });
      });
      y += 6;
    });
  }

  const filename = `${KIND_LABEL[form.kind].toLowerCase()}-${slugify(form.name)}.pdf`;
  const blob = doc.output("blob");
  return { filename, blob };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { triggerDownload };
