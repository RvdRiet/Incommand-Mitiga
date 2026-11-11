"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import {
  FEMA_ICS_FORMS_INDEX_URL,
  getRequiredFormsFromIcs202,
  parseFormContent,
} from "@/lib/incident/ics-forms-catalog";
import {
  getStoredFormActorName,
  resolveFormActor,
  setStoredFormActorName,
} from "@/lib/incident/form-actor";

import { FormsAddMenu } from "../FormsAddMenu";
import { CustomFormBuilder } from "../CustomFormBuilder";
import { IcsFormEditor, type IcsFormEditorHandle } from "../IcsFormEditor";
import { formatDate, RowDelete } from "../shared";
import type { CustomForm } from "@/lib/incident/types";

export function FormsView() {
  const { data: session } = useSession();
  const eventId = useEventId();
  const forms = useIncidentStore((s) => s.forms);
  const addForm = useIncidentStore((s) => s.addForm);
  const autoPopulateForm = useIncidentStore((s) => s.autoPopulateForm);
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
  const [tab, setTab] = useState<"ics" | "custom">("ics");

  useEffect(() => {
    setActorName(getStoredFormActorName());
  }, []);

  useEffect(() => {
    setSaveNotice(null);
  }, [selectedId]);

  /** The signed-in account (falls back to the typed/stored name) — recorded as creator/editor. */
  const currentActor = () =>
    resolveFormActor({
      sessionName: session?.user?.name,
      sessionEmail: session?.user?.email,
      storedName: actorName,
    });

  const handleAddForm = (templateId: string) => {
    const id = addForm(templateId, currentActor());
    if (id) setSelectedId(id);
  };

  const exportPdfForForm = async (
    form: NonNullable<typeof selected>,
    metaOverride?: { savedAt: string; savedBy: string; savedByEmail?: string | null },
  ): Promise<{ filename: string; archived: boolean }> => {
    const { exportIcsFormRecordToPdf } = await import("@/lib/incident/ics-form-pdf");
    const savedAt = metaOverride?.savedAt ?? form.savedAt ?? new Date().toISOString();
    const parsed = parseFormContent(form.content, form.templateId);

    // When signed in, also archive the generated PDF to the incident's blob
    // storage (best-effort — no-ops offline / when not authenticated).
    let archived = false;
    const archive = session
      ? async (blob: Blob, filename: string) => {
          const { uploadIncidentBlob } = await import("@/lib/storage/upload-client");
          const file = new File([blob], filename, { type: "application/pdf" });
          const res = await uploadIncidentBlob(eventId, file, "ics_pdf");
          archived = res !== null;
        }
      : undefined;

    const filename = await exportIcsFormRecordToPdf(
      () => formEditorRef.current?.getExportRoot() ?? null,
      {
        formNumber: form.formNumber,
        formName: form.name,
        savedAt,
        meta: metaOverride ??
          parsed.meta ?? {
            savedAt,
            savedBy: form.filledBy ?? (actorName || "Operator"),
          },
        legacyText: parsed.isStructured ? undefined : form.content,
        archive,
      },
    );
    return { filename, archived };
  };

  const handleSaveForm = async () => {
    if (!selected) return;
    const actor = currentActor();
    setStoredFormActorName(actor.name);
    setPdfExporting(true);
    setSaveNotice("Saving form and generating PDF…");

    const savedAt = new Date().toISOString();
    const meta = {
      savedAt,
      savedBy: actor.name,
      savedByEmail: actor.email ?? null,
    };

    let result: { filename: string; archived: boolean } | null = null;
    try {
      result = await exportPdfForForm(selected, meta);
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

    const ok = saveForm(selected.id, actor, { pdfFileName: result.filename });
    if (ok) {
      setSaveNotice(
        `Saved ${formatDate(new Date().toISOString())} by ${actor.name}. PDF downloaded (${result.filename})${
          result.archived ? " · archived to server" : ""
        }.`,
      );
    }
    setPdfExporting(false);
  };

  const handleDownloadPdf = async () => {
    if (!selected) return;
    setPdfExporting(true);
    setSaveNotice("Generating PDF…");
    try {
      const { filename, archived } = await exportPdfForForm(selected);
      setSaveNotice(
        `PDF downloaded (${filename})${archived ? " · archived to server" : ""}.`,
      );
    } catch (err) {
      setSaveNotice(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setPdfExporting(false);
    }
  };

  const contentMeta = selected
    ? parseFormContent(selected.content, selected.templateId).meta
    : undefined;

  // Forms the IAP calls for, derived from ticked attachment boxes on the ICS-202.
  const requiredForms = getRequiredFormsFromIcs202(forms);
  const presentTemplateIds = new Set(forms.map((f) => f.templateId));
  const missingRequired = requiredForms.filter((r) => !presentTemplateIds.has(r.templateId));

  const openTemplate = (templateId: string) => {
    const existing = forms.find((f) => f.templateId === templateId);
    if (existing) setSelectedId(existing.id);
    else handleAddForm(templateId);
  };

  return (
    <section className="ic-forms-layout">
      <div className="ic-forms-tabs" role="tablist" aria-label="Forms type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ics"}
          className={`ic-forms-tab${tab === "ics" ? " ic-forms-tab--on" : ""}`}
          onClick={() => setTab("ics")}
        >
          ICS forms
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "custom"}
          className={`ic-forms-tab${tab === "custom" ? " ic-forms-tab--on" : ""}`}
          onClick={() => setTab("custom")}
        >
          Forms &amp; surveys
        </button>
      </div>

      {tab === "custom" ? (
        <CustomFormsSection />
      ) : (
        <>
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
      {requiredForms.length > 0 ? (
        <section className="ic-required-forms">
          <div className="ic-required-forms__head">
            <strong>Forms to complete</strong>
            <span className="ic-required-forms__sub">
              From the attachments ticked on ICS 202 (Incident Objectives)
              {missingRequired.length > 0 ? ` · ${missingRequired.length} not yet created` : " · all created"}
            </span>
            {missingRequired.length > 0 ? (
              <button
                type="button"
                className="ic-btn-secondary ic-btn-secondary--sm"
                onClick={() => missingRequired.forEach((r) => addForm(r.templateId, currentActor()))}
              >
                Create all missing
              </button>
            ) : null}
          </div>
          <ul className="ic-required-forms__list">
            {requiredForms.map((r) => {
              const present = presentTemplateIds.has(r.templateId);
              return (
                <li
                  key={r.templateId}
                  className={`ic-required-forms__item${present ? " ic-required-forms__item--done" : ""}`}
                >
                  <span className="ic-required-forms__check" aria-hidden>
                    {present ? "✓" : "○"}
                  </span>
                  <button
                    type="button"
                    className="ic-required-forms__label"
                    onClick={() => openTemplate(r.templateId)}
                  >
                    {r.label}
                  </button>
                  <span className="ic-required-forms__status">
                    {present ? "Created" : "Add"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <div className="ic-forms-split">
        <section className="ic-table-wrap">
          <table className="ic-table ic-table--clickable">
            <thead>
              <tr>
                <th>Form</th>
                <th>Status</th>
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
                    <span className="ic-form-name">
                      {f.name}
                      {f.formNumber ? <span className="ic-form-number">ICS {f.formNumber}</span> : null}
                      {f.inIap ? <span className="ic-form-iap-tag">IAP</span> : null}
                    </span>
                    <span className="ic-form-meta">
                      {f.createdBy ? <>Created by {f.createdBy}</> : null}
                      {f.savedAt ? (
                        <>
                          {f.createdBy ? " · " : ""}edited {formatDate(f.savedAt)}
                          {f.filledBy ? ` by ${f.filledBy}` : ""}
                        </>
                      ) : null}
                      {!f.createdBy && !f.savedAt ? "Not yet saved" : null}
                    </span>
                  </td>
                  <td>
                    <span className={`ic-form-status ic-form-status--${f.status ?? "draft"}`}>
                      {f.status ?? "draft"}
                    </span>
                  </td>
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
                {selected.templateId === "ICS-209" ? (
                  <button
                    type="button"
                    className="ic-btn-secondary ic-btn-secondary--sm"
                    disabled={pdfExporting}
                    title="Refresh the situation, resource and damage summaries from current incident data"
                    onClick={() => {
                      if (autoPopulateForm(selected.id)) {
                        setSaveNotice("Summaries refreshed from live incident data.");
                      }
                    }}
                  >
                    Populate from incident
                  </button>
                ) : null}
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
              {selected.createdBy || selected.savedAt || selected.filledBy || contentMeta ? (
                <p className="ic-form-editor__save-meta">
                  {selected.createdBy ? (
                    <span>Created by {selected.createdBy}</span>
                  ) : null}
                  {selected.savedAt ? (
                    <span>
                      {selected.createdBy ? " · " : ""}Last saved {formatDate(selected.savedAt)}
                    </span>
                  ) : null}
                  {selected.filledBy ? <span> by {selected.filledBy}</span> : null}
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
        </>
      )}
    </section>
  );
}

/**
 * The custom form / survey / checklist workspace: a list of user-built forms on
 * the left and the drag-and-drop builder on the right. Everything persists in the
 * incident state (customForms) → synced to the DB via the forms module, and shown
 * in the Library.
 */
function CustomFormsSection() {
  const customForms = useIncidentStore((s) => s.customForms);
  const addCustomForm = useIncidentStore((s) => s.addCustomForm);
  const removeCustomForm = useIncidentStore((s) => s.removeCustomForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = customForms.find((f) => f.id === selectedId) ?? null;

  const create = (kind: CustomForm["kind"]) => {
    const id = addCustomForm(kind);
    setSelectedId(id);
  };

  const kindLabel = (k: CustomForm["kind"]) =>
    k === "survey" ? "Survey" : k === "checklist" ? "Checklist" : "Form";

  return (
    <div className="ic-forms-split ic-forms-split--custom">
      <section className="ic-table-wrap">
        <div className="ic-cfb-new">
          <button type="button" className="ic-btn-add" onClick={() => create("form")}>
            + New form
          </button>
          <button type="button" className="ic-btn-secondary ic-btn-secondary--sm" onClick={() => create("survey")}>
            + Survey
          </button>
          <button type="button" className="ic-btn-secondary ic-btn-secondary--sm" onClick={() => create("checklist")}>
            + Checklist
          </button>
        </div>
        <table className="ic-table ic-table--clickable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Fields</th>
              <th>Responses</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {customForms.map((f) => (
              <tr
                key={f.id}
                className={selectedId === f.id ? "ic-table__row--selected" : ""}
                onClick={() => setSelectedId(f.id)}
              >
                <td>
                  <span className="ic-form-name">{f.name}</span>
                </td>
                <td>{kindLabel(f.kind)}</td>
                <td>{f.fields.length}</td>
                <td>{f.responses.length}</td>
                <td>{f.status}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <RowDelete
                    onClick={() => {
                      removeCustomForm(f.id);
                      if (selectedId === f.id) setSelectedId(null);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customForms.length === 0 ? (
          <p className="ic-table-empty">
            No custom forms yet. Create a form, survey, or checklist and build it by dragging
            components.
          </p>
        ) : null}
      </section>
      {selected ? (
        <aside className="ic-form-editor ic-form-editor--builder">
          <CustomFormBuilder formId={selected.id} />
        </aside>
      ) : (
        <aside className="ic-form-editor ic-form-editor--empty">
          <p className="ic-empty-hint">Select a form to build, or create one above.</p>
        </aside>
      )}
    </div>
  );
}
