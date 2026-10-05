"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import {
  buildModuleExport,
  downloadCsv,
  printModuleReport,
} from "@/lib/incident/module-export";

/**
 * D4H-style "⋮" data-tools menu for operational modules: Export CSV, Print to PDF,
 * and Print grouped by status. Reads module data straight from the incident store so
 * it works without touching any view component.
 */
export function ModuleDataMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const incidentName = useIncidentStore((s) => s.situation.name);
  const damages = useIncidentStore((s) => s.damages);
  const residentAreas = useIncidentStore((s) => s.residentAreas);
  const resourceRequests = useIncidentStore((s) => s.resourceRequests);
  const roadDamages = useIncidentStore((s) => s.roadDamages);
  const shelters = useIncidentStore((s) => s.shelters);
  const utilities = useIncidentStore((s) => s.utilities);
  const personnel = useIncidentStore((s) => s.personnel);
  const library = useIncidentStore((s) => s.library);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const data = buildModuleExport(slug, {
    damages,
    residentAreas,
    resourceRequests,
    roadDamages,
    shelters,
    utilities,
    personnel,
    library,
  });
  if (!data) return null;

  const groupIdx = data.headers.findIndex((h) => h === "Status" || h === "Category");
  const name = incidentName || "Incident";

  return (
    <div className="ic-module-menu" ref={rootRef}>
      <button
        type="button"
        className="ic-toolbar-text-btn ic-module-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title="Data tools"
        onClick={() => setOpen((v) => !v)}
      >
        ⋮
      </button>
      {open ? (
        <ul id={menuId} className="ic-module-menu__dropdown" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="ic-module-menu__item"
              onClick={() => {
                downloadCsv(data, name);
                setOpen(false);
              }}
            >
              Export CSV…
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="ic-module-menu__item"
              onClick={() => {
                printModuleReport(data, name);
                setOpen(false);
              }}
            >
              Print to PDF…
            </button>
          </li>
          {groupIdx >= 0 ? (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="ic-module-menu__item"
                onClick={() => {
                  printModuleReport(data, name, groupIdx);
                  setOpen(false);
                }}
              >
                Print grouped by {data.headers[groupIdx].toLowerCase()}…
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
