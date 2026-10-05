import type { IncidentState } from "./types";

/**
 * Client-side incident bundle export (TOR §4.10 IAP / audit). Triggers a .json
 * download and returns the filename + Blob so the caller can also archive it.
 */
export function downloadIncidentExport(
  state: IncidentState,
): { filename: string; blob: Blob } {
  const bundle = {
    exportedAt: new Date().toISOString(),
    version: 1,
    situation: state.situation,
    operationalPeriods: state.operationalPeriods,
    calendarEvents: state.calendarEvents,
    personnel: state.personnel,
    roleGroups: state.roleGroups,
    logs: state.logs,
    audit: state.audit,
    forms: state.forms,
    taskLists: state.taskLists,
    damages: state.damages,
    residents: state.residents,
    residentAreas: state.residentAreas,
    resourceRequests: state.resourceRequests,
    roadDamages: state.roadDamages,
    shelters: state.shelters,
    utilities: state.utilities,
    library: state.library,
    mapAnnotations: state.mapAnnotations,
    supplyRoutes: state.supplyRoutes,
    statusBoards: state.statusBoards,
    contactGroups: state.contactGroups,
    notifications: state.notifications,
    settings: state.settings,
  };

  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const safe =
    state.situation.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() ||
    "export";
  const filename = `incident-${safe}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { filename, blob };
}
