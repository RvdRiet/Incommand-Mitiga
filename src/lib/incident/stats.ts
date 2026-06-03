import type { IncidentState } from "./types";

export function dashboardStats(state: IncidentState) {
  const minor = state.damages.filter((d) => d.status === "minor").length;
  const severe = state.damages.filter((d) => d.status === "severe").length;

  const roadClosed = state.roadDamages.filter((r) => r.status === "closed").length;
  const roadOneLane = state.roadDamages.filter((r) => r.status === "one_lane").length;
  const roadOpen = state.roadDamages.filter((r) => r.status === "open").length;

  const taskItems = state.taskLists.flatMap((l) => l.items);
  const taskCounts = {
    canceled: taskItems.filter((t) => t.status === "canceled").length,
    complete: taskItems.filter((t) => t.status === "complete").length,
    in_progress: taskItems.filter((t) => t.status === "in_progress").length,
    not_started: taskItems.filter((t) => t.status === "not_started").length,
  };

  const rr = {
    requested: state.resourceRequests.filter((r) => r.status === "requested").length,
    enroute: state.resourceRequests.filter((r) => r.status === "enroute").length,
    assigned: state.resourceRequests.filter((r) => r.status === "assigned").length,
    ready: state.resourceRequests.filter((r) => r.status === "ready").length,
  };

  const utilitiesImpacted = state.utilities.reduce(
    (sum, u) => sum + u.customersWithoutPower,
    0,
  );

  const shelterOccupancy = state.shelters.reduce((sum, s) => sum + s.occupancy, 0);

  return {
    personnelTotal: state.personnel.length,
    personnelOnline: state.personnel.filter((p) => p.online).length,
    minorDamage: minor,
    severeDamage: severe,
    electricityOutages: utilitiesImpacted,
    residentsTotal: state.residents.length,
    residentAreasTotal: state.residentAreas.length,
    censusPopulationTotal: state.residentAreas.reduce((s, a) => s + a.censusPopulation, 0),
    estimatedAffectedTotal: state.residentAreas.reduce((s, a) => s + a.estimatedAffected, 0),
    roadClosed,
    roadOneLane,
    roadOpen,
    sheltersTotal: state.shelters.length,
    shelterOccupancy,
    taskCounts,
    resourceRequests: rr,
    logPreview: state.logs.slice(0, 5),
    upcomingEvents: [...state.calendarEvents]
      .filter((e) => new Date(e.endAt || e.startAt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      .slice(0, 5),
    operationalPeriodCount: state.operationalPeriods.length,
    statusBoardItems: state.statusBoards.reduce((n, b) => n + b.items.length, 0),
    openStatusItems: state.statusBoards
      .flatMap((b) => b.items)
      .filter((i) => i.columnId !== "col-done").length,
    notificationCount: state.notifications.length,
  };
}
