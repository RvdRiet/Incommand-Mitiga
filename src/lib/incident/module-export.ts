import type {
  DamageRecord,
  IncidentState,
  LibraryItem,
  Personnel,
  ResidentArea,
  ResourceRequest,
  RoadDamage,
  Shelter,
  UtilityRow,
} from "./types";

/** A tabular export/print snapshot of an operational module. */
export type ModuleExport = {
  title: string;
  headers: string[];
  rows: string[][];
};

type Column<T> = { label: string; get: (row: T) => string | number | null | undefined };

function build<T>(title: string, items: T[], columns: Column<T>[]): ModuleExport {
  return {
    title,
    headers: columns.map((c) => c.label),
    rows: items.map((item) => columns.map((c) => String(c.get(item) ?? ""))),
  };
}

function money(v: number | null | undefined): string {
  if (v == null) return "";
  return `R ${Number(v).toLocaleString("en-ZA")}`;
}

const DAMAGE_COLUMNS: Column<DamageRecord>[] = [
  { label: "Name", get: (d) => d.name },
  { label: "Damage Description", get: (d) => d.description },
  { label: "Estimated Cost", get: (d) => money(d.estimatedCost) },
  { label: "Status", get: (d) => d.status },
];

const RESIDENT_AREA_COLUMNS: Column<ResidentArea>[] = [
  { label: "City / Area", get: (r) => r.city },
  { label: "Municipality", get: (r) => r.municipality },
  { label: "Province", get: (r) => r.province },
  { label: "Census Population", get: (r) => r.censusPopulation },
  { label: "Estimated Affected", get: (r) => r.estimatedAffected },
  { label: "Tracked Residents", get: (r) => r.trackedResidents },
  { label: "Notes", get: (r) => r.notes },
];

const RESOURCE_COLUMNS: Column<ResourceRequest>[] = [
  { label: "Resource", get: (r) => r.resource },
  { label: "Status", get: (r) => r.status },
  { label: "Cost Per Hour", get: (r) => money(r.costPerHour) },
  { label: "Hours", get: (r) => r.hours },
];

const ROAD_COLUMNS: Column<RoadDamage>[] = [
  { label: "Road Name", get: (r) => r.roadName },
  { label: "From", get: (r) => r.fromIntersection },
  { label: "To", get: (r) => r.toIntersection },
  { label: "Status", get: (r) => r.status },
  { label: "Municipality", get: (r) => r.municipality },
  { label: "Location", get: (r) => r.location },
  { label: "Reason", get: (r) => r.reason },
  { label: "Time Reported", get: (r) => r.timeReported },
];

const SHELTER_COLUMNS: Column<Shelter>[] = [
  { label: "Name", get: (s) => s.name },
  { label: "Status", get: (s) => s.status },
  { label: "Capacity", get: (s) => s.capacity },
  { label: "Occupancy", get: (s) => s.occupancy },
];

const UTILITY_COLUMNS: Column<UtilityRow>[] = [
  { label: "City", get: (u) => u.city },
  { label: "Municipality", get: (u) => u.municipality },
  { label: "Hazard Region", get: (u) => u.hazardRegion },
  { label: "Tier", get: (u) => u.tier },
  { label: "Status", get: (u) => u.status },
  { label: "Customers Without Power", get: (u) => u.customersWithoutPower },
  { label: "Total Customers", get: (u) => u.totalCustomers },
];

const PERSONNEL_COLUMNS: Column<Personnel>[] = [
  { label: "Name", get: (p) => p.name },
  { label: "Role", get: (p) => p.role },
  { label: "Status", get: (p) => (p.online ? "Online" : "Offline") },
];

const LIBRARY_COLUMNS: Column<LibraryItem>[] = [
  { label: "Name", get: (l) => l.name },
  { label: "Category", get: (l) => l.category ?? "" },
  { label: "Modified", get: (l) => l.modifiedAt },
];

/** Which store field + columns + human title back each exportable module. */
export function buildModuleExport(
  slug: string,
  state: Pick<
    IncidentState,
    | "damages"
    | "residentAreas"
    | "resourceRequests"
    | "roadDamages"
    | "shelters"
    | "utilities"
    | "personnel"
    | "library"
  >,
): ModuleExport | null {
  switch (slug) {
    case "damage-assessment":
      return build("Damage Assessment", state.damages, DAMAGE_COLUMNS);
    case "residents":
      return build("Residents", state.residentAreas, RESIDENT_AREA_COLUMNS);
    case "resource-requests":
      return build("Resource Requests", state.resourceRequests, RESOURCE_COLUMNS);
    case "road-damages":
      return build("Road Damages", state.roadDamages, ROAD_COLUMNS);
    case "shelters":
      return build("Shelters", state.shelters, SHELTER_COLUMNS);
    case "utilities-electricity":
      return build("Utilities - Electricity", state.utilities, UTILITY_COLUMNS);
    case "personnel":
      return build("Personnel", state.personnel, PERSONNEL_COLUMNS);
    case "library":
      return build("Library", state.library, LIBRARY_COLUMNS);
    default:
      return null;
  }
}

export const EXPORTABLE_MODULE_SLUGS = new Set([
  "damage-assessment",
  "residents",
  "resource-requests",
  "road-damages",
  "shelters",
  "utilities-electricity",
  "personnel",
  "library",
]);

/* ----------------------------- Output helpers ----------------------------- */

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(data: ModuleExport): string {
  const lines = [data.headers, ...data.rows].map((row) => row.map(csvCell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(data: ModuleExport, incidentName: string): void {
  const csv = toCsv(data);
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = `${incidentName}-${data.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug || "export"}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a clean printable report of the module (title, incident, timestamp, table)
 * in a hidden iframe and invoke the browser print dialog — the reliable, popup-safe
 * path to a "Print to PDF" (the user chooses Save as PDF). Groups rows by an optional
 * status/category column so the printout reads like a status board.
 */
export function printModuleReport(
  data: ModuleExport,
  incidentName: string,
  groupByIndex?: number,
): void {
  const generated = new Date().toLocaleString("en-ZA");

  const headerCells = data.headers
    .filter((_, i) => i !== groupByIndex)
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join("");

  let bodyHtml = "";
  if (groupByIndex != null && groupByIndex >= 0) {
    const groups = new Map<string, string[][]>();
    for (const row of data.rows) {
      const key = row[groupByIndex] || "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    const span = data.headers.length - 1 || 1;
    for (const [key, rows] of [...groups.entries()].sort()) {
      bodyHtml += `<tr class="grp"><td colspan="${span}">${escapeHtml(
        data.headers[groupByIndex],
      )}: ${escapeHtml(key)} (${rows.length})</td></tr>`;
      bodyHtml += rows
        .map(
          (row) =>
            `<tr>${row
              .filter((_, i) => i !== groupByIndex)
              .map((c) => `<td>${escapeHtml(c)}</td>`)
              .join("")}</tr>`,
        )
        .join("");
    }
  } else {
    bodyHtml = data.rows
      .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("");
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    data.title,
  )}</title><style>
    * { font-family: Arial, Helvetica, sans-serif; }
    body { margin: 24px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; }
    tr.grp td { background: #e8eef0; font-weight: bold; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <h1>${escapeHtml(data.title)}</h1>
    <div class="meta">Incident: ${escapeHtml(incidentName)} &middot; ${escapeHtml(
      String(data.rows.length),
    )} record(s) &middot; Generated ${escapeHtml(generated)}</div>
    <table><thead><tr>${headerCells}</tr></thead><tbody>${
      bodyHtml || `<tr><td colspan="${data.headers.length}">No records.</td></tr>`
    }</tbody></table>
  </body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }
  // Give the iframe a tick to lay out before printing.
  win.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(() => iframe.remove(), 1000);
  }, 150);
}
