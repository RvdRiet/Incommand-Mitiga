"use client";

import { useMemo, useState } from "react";

import {
  FEMA_ICS_BOOKLET_URL,
  FEMA_ICS_FORMS_INDEX_URL,
  getIcsFormTemplatesGrouped,
  searchIcsFormTemplates,
} from "@/lib/incident/ics-forms-catalog";

type FormsAddMenuProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
};

export function FormsAddMenu({ open, onClose, onSelect }: FormsAddMenuProps) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const matches = searchIcsFormTemplates(query);
    const ids = new Set(matches.map((t) => t.id));
    return getIcsFormTemplatesGrouped()
      .map((g) => ({
        ...g,
        templates: g.templates.filter((t) => ids.has(t.id)),
      }))
      .filter((g) => g.templates.length > 0);
  }, [query]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="ic-forms-menu-backdrop" aria-label="Close menu" onClick={onClose} />
      <div className="ic-forms-menu-panel" role="dialog" aria-label="Add official ICS form">
        <header className="ic-forms-menu-panel__head">
          <div>
            <h3>Add official ICS form</h3>
            <p className="ic-forms-menu-panel__sub">
              FEMA NIMS ICS Forms (EMI).{" "}
              <a href={FEMA_ICS_FORMS_INDEX_URL} target="_blank" rel="noopener noreferrer">
                All PDFs
              </a>
              {" · "}
              <a href={FEMA_ICS_BOOKLET_URL} target="_blank" rel="noopener noreferrer">
                Forms booklet
              </a>
            </p>
          </div>
          <button type="button" className="ic-row-delete" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <input
          type="search"
          className="ic-forms-menu-panel__search"
          placeholder="Search by number, title, or role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="ic-forms-menu-panel__list">
          {groups.length === 0 ? (
            <p className="ic-empty-hint">No forms match your search.</p>
          ) : (
            groups.map((group) => (
              <section key={group.category}>
                <h4>{group.label}</h4>
                <ul>
                  {group.templates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="ic-forms-menu-item"
                        onClick={() => {
                          onSelect(t.id);
                          onClose();
                          setQuery("");
                        }}
                      >
                        <span className="ic-forms-menu-item__title">
                          ICS {t.number} — {t.title}
                          {t.inIap ? <span className="ic-forms-menu-item__iap">IAP</span> : null}
                        </span>
                        <span className="ic-forms-menu-item__meta">
                          {t.preparedBy} · {t.version}
                        </span>
                      </button>
                      <a
                        href={t.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ic-forms-menu-item__pdf"
                        title="Open official FEMA PDF"
                        onClick={(e) => e.stopPropagation()}
                      >
                        PDF
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}
