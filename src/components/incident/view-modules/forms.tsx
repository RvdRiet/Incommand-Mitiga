"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { useIncidentStore } from "@/context/EventContext";
import {
  FEMA_ICS_FORMS_INDEX_URL,
  parseFormContent,
} from "@/lib/incident/ics-forms-catalog";
import {
  getStoredFormActorName,
  resolveFormActor,
  setStoredFormActorName,
} from "@/lib/incident/form-actor";

import { FormsAddMenu } from "../FormsAddMenu";
import { IcsFormEditor, type IcsFormEditorHandle } from "../IcsFormEditor";
import { formatDate, RowDelete } from "../shared";

export function FormsView() {
  const { data: session } = useSession();
  const forms = useIncidentStore((s) => s.forms);
  const addForm = useIncidentStore((s) => s.addForm);
  const updateForm = useIncidentStore((s) => s.updateForm);
  const saveForm = useIncidentStore((s) => s.saveForm);
  const removeForm = useIncidentStore((s) => s.removeForm);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actorName, setActorName] = useState("");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const formEditorRef = useRef<IcsFormEditorHandle>(null);
  const selected = forms.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    setActorName(getStoredFormActorName());
  }, []);

  useEffect(() => {
    setSaveNotice(null);
  }, [selectedId]);

  const handleAddForm = (templateId: string) => {
    const id = addForm(templateId);
    if (id) setSelectedId(id);
  };

  const exportPdfForForm = async (
    form: NonNullable<typeof selected>,
    metaOverride?: { savedAt: string; savedBy: string; savedByEmail?: string | null },
  ) => {
    const { exportIcsFormRecordToPdf } = await import("@/lib/incident/ics-form-pdf");
    const savedAt = metaOverride?.savedAt ?? form.savedAt ?? new Date().toISOString();
    const parsed = parseFormContent(form.content, form.templateId);
    return exportIcsFormRecordToPdf(() => formEditorRef.current?.getExportRoot() ?? null, {
      formNumber: form.formNumber,
      formName: form.name,
      savedAt,
      meta: metaOverride ??
        parsed.meta ?? {
          savedAt,
          savedBy: form.filledBy ?? (actorName || "Operator"),
        },
      legacyText: parsed.isStructured ? undefined : form.content,
    });
  };

  const handleSaveForm = async () => {
    if (!selected) return;
    const actor = resolveFormActor({
      sessionName: session?.user?.name,
      sessionEmail: session?.user?.email,
      storedName: actorName,
    });
    setStoredFormActorName(actor.name);
    setPdfExporting(true);
    setSaveNotice("Saving form and generating PDF…");

    const savedAt = new Date().toISOString();
    const meta = {
      savedAt,
      savedBy: actor.name,
      savedByEmail: actor.email ?? null,
    };

    let pdfFileName: string | null = null;
    try {
      pdfFileName = await exportPdfForForm(selected, meta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF export failed";
      const ok = saveForm(selected.id, actor);
      setSaveNotice(
        ok
          ? `Saved ${formatDate(new Date().toISOString())} by ${actor.name}. PDF: ${msg}`
          : `Could not save form. ${msg}`,
      );
      setPdfExporting(false);
      return;
    }

    const ok = saveForm(selected.id, actor, { pdfFileName });
    if (ok) {
      setSaveNotice(
        `Saved ${formatDate(new Date().toISOString())} by ${actor.name}. PDF downloaded (${pdfFileName}).`,
      );
    }
    setPdfExporting(false);
  };

  const handleDownloadPdf = async () => {
    if (!selected) return;
    setPdfExporting(true);
    setSaveNotice("Generating PDF…");
    try {
      const pdfFileName = await exportPdfForForm(selected);
      setSaveNotice(`PDF downloaded (${pdfFileName}).`);
    } catch (err) {
      setSaveNotice(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setPdfExporting(false);
    }
  };

  const contentMeta = selected
    ? parseFormContent(selected.content, selected.templateId).meta
    : undefined;

  return (
    <section className="ic-forms-layout">
      <header className="ic-forms-header">
        <a
          href={FEMA_ICS_FORMS_INDEX_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ic-forms-header__link"
        >
          Official FEMA ICS forms ↗
        </a>
        <div className="ic-forms-add">
          <button type="button" className="ic-btn-add" onClick={() => setMenuOpen(true)}>
            + Add ICS form ▾
          </button>
          <FormsAddMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onSelect={handleAddForm}
          />
        </div>
      </header>
      <div className="ic-forms-split">
        <section className="ic-table-wrap">
          <table className="ic-table ic-table--clickable">
            <thead>
              <tr>
                <th>Form</th>
                <th>IAP</th>
                <th>Status</th>
                <th>Saved</th>
                <th>Filled by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr
                  key={f.id}
                  className={selectedId === f.id ? "ic-table__row--selected" : ""}
                  onClick={() => setSelectedId(f.id)}
                >
                  <td>
                    <span className="ic-form-name">{f.name}</span>
                    {f.formNumber ? (
                      <span className="ic-form-number">ICS {f.formNumber}</span>
                    ) : null}
                  </td>
                  <td>{f.inIap ? "Yes" : "—"}</td>
                  <td>{f.status ?? "draft"}</td>
                  <td>{f.savedAt ? formatDate(f.savedAt) : "—"}</td>
                  <td>{f.filledBy ?? "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <RowDelete
                      onClick={() => {
                        removeForm(f.id);
                        if (selectedId === f.id) setSelectedId(null);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {forms.length === 0 ? <p className="ic-table-empty">No forms yet.</p> : null}
        </section>
        {selected ? (
          <aside className="ic-form-editor ic-form-editor--fema">
            <header className="ic-form-editor__head">
              <div>
                <h3>{selected.name}</h3>
                {selected.officialTitle ? (
                  <p className="ic-form-editor__subtitle">{selected.officialTitle}</p>
                ) : null}
              </div>
              {selected.pdfUrl ? (
                <a
                  href={selected.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ic-btn-secondary ic-btn-secondary--sm"
                >
                  Official PDF ↗
                </a>
              ) : null}
            </header>
            <div className="ic-form-editor__toolbar">
              <label className="ic-field ic-field--compact">
                <span>Your name (for save record)</span>
                <input
                  type="text"
                  value={actorName}
                  placeholder={session?.user?.email ?? "Operator name"}
                  onChange={(e) => setActorName(e.target.value)}
                  onBlur={() => setStoredFormActorName(actorName)}
                />
              </label>
              <div className="ic-form-editor__save-row">
                <button
                  type="button"
                  className="ic-btn-add"
                  disabled={pdfExporting}
                  onClick={() => void handleSaveForm()}
                >
                  {pdfExporting ? "Saving…" : "Save form & PDF"}
                </button>
                <button
                  type="button"
                  className="ic-btn-secondary ic-btn-secondary--sm"
                  disabled={pdfExporting}
                  onClick={() => void handleDownloadPdf()}
                >
                  Download PDF
                </button>
                <label className="ic-field ic-field--compact">
                  <span>Status</span>
                  <select
                    value={selected.status ?? "draft"}
                    onChange={(e) =>
                      updateForm(selected.id, {
                        status: e.target.value as "draft" | "published",
                      })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </label>
              </div>
              {selected.savedAt || selected.filledBy || contentMeta ? (
                <p className="ic-form-editor__save-meta">
                  {selected.savedAt ? (
                    <span>Last saved {formatDate(selected.savedAt)}</span>
                  ) : null}
                  {selected.filledBy ? <span> · {selected.filledBy}</span> : null}
                  {contentMeta?.savedByEmail ? (
                    <span> ({contentMeta.savedByEmail})</span>
                  ) : null}
                  {contentMeta?.pdfFileName ? (
                    <span> · PDF: {contentMeta.pdfFileName}</span>
                  ) : null}
                </p>
              ) : (
                <p className="ic-form-editor__save-meta ic-form-editor__save-meta--hint">
                  Saves structured JSON and downloads a letter-size PDF matching the FEMA layout
                  (field order, values, timestamp, and who filled it in).
                </p>
              )}
              {saveNotice ? (
                <p className="ic-form-editor__save-notice" role="status">
                  {saveNotice}
                </p>
              ) : null}
            </div>
            <IcsFormEditor
              ref={formEditorRef}
              form={selected}
              onChange={(patch) => updateForm(selected.id, patch)}
            />
          </aside>
        ) : (
          <aside className="ic-form-editor ic-form-editor--empty">
            <p className="ic-empty-hint">Select a form to edit.</p>
          </aside>
        )}
      </div>
    </section>
  );
}
