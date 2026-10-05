import type { IncidentState } from "./types";
import { dashboardStats } from "./stats";
import { crewReadinessSummary, type ReadinessData } from "./readiness";

/**
 * ICS-209 (Incident Status Summary) auto-population.
 *
 * The 209 is the periodic roll-up command sends to agency administrators. Rather than
 * retype it every operational period, we synthesise its narrative fields from live
 * incident data — situation, population impact, responder readiness and damage — using
 * the same `dashboardStats` and readiness engine the dashboard and Analytics module use,
 * so the summary always agrees with the rest of the system.
 *
 * Field ids target the rendered FEMA spec (`ics-form-specs/registry.ts` → "ICS-209"),
 * NOT the simplified catalog template. Only fields we can derive a value for are
 * returned; callers merge these over existing fields so hand-typed values (incident
 * number, weather, strategic discussion, etc.) are preserved.
 */
export function buildIcs209Fields(
  state: IncidentState,
  now: number = Date.now(),
): Record<string, string> {
  const s = dashboardStats(state);
  const sit = state.situation;

  const data: ReadinessData = {
    shifts: state.shifts,
    certifications: state.certifications,
    roleGroups: state.roleGroups,
    fieldUnits: state.fieldUnits,
  };
  const crew = crewReadinessSummary(
    state.personnel,
    data,
    {
      maxShiftHours: state.settings.maxShiftHours ?? 12,
      maxOnDuty24h: state.settings.maxOnDuty24h ?? 16,
      minRestHours: state.settings.minRestHours ?? 8,
    },
    state.settings.certReminderDays ?? 30,
    now,
  );

  const n = (v: number) => v.toLocaleString();
  const plural = (v: number, word: string) => `${n(v)} ${word}${v === 1 ? "" : "s"}`;

  const out: Record<string, string> = {};
  const set = (id: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) out[id] = v;
  };

  // Header
  set("incidentName", sit.name);
  set("locationDescription", sit.location);
  set("strategicObjectives", sit.objectives);
  set("startDate", toDateInput(sit.startDate));
  set("periodFrom", toDateTimeInput(sit.startDate));
  set("periodTo", toDateTimeInput(sit.endDate));

  // 28. Significant events — the situation narrative plus task/damage rollup.
  set(
    "significantEvents",
    [
      sit.summary?.trim() || null,
      sit.activationLevel ? `Activation level: ${sit.activationLevel}.` : null,
      `Task progress: ${n(s.taskCounts.complete)} complete, ${n(
        s.taskCounts.in_progress,
      )} in progress, ${n(s.taskCounts.not_started)} not started.`,
      `Damage: ${n(s.severeDamage)} severe / ${n(s.minorDamage)} minor structure site${
        s.minorDamage === 1 ? "" : "s"
      }; roads ${n(s.roadClosed)} closed, ${n(s.roadOneLane)} one-lane, ${n(
        s.roadOpen,
      )} open; ~${plural(s.electricityOutages, "customer")} without power.`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  // 31. Public status summary — population impact & sheltering.
  set(
    "publicStatusSummary",
    `~${n(s.estimatedAffectedTotal)} of ${n(s.censusPopulationTotal)} residents affected across ${plural(
      s.residentAreasTotal,
      "area",
    )}. ` +
      `Sheltering ${n(s.shelterOccupancy)} in ${plural(s.sheltersTotal, "shelter")}. ` +
      `~${plural(s.electricityOutages, "customer")} without power.`,
  );

  // 32. Responder status summary — headcount & deployment readiness.
  set(
    "responderStatusSummary",
    `${plural(crew.total, "responder")} assigned, ${n(crew.onDuty)} on duty now. ` +
      `Readiness: ${n(crew.ready)} ready, ${n(crew.caution)} caution, ${n(
        crew.blocked,
      )} not deployable. ` +
      `${plural(crew.fatigued, "fatigue flag")}, ${plural(
        crew.expiredCerts,
        "expired certification",
      )}.`,
  );

  // 39. Critical resource needs — open resource requests.
  set(
    "criticalResources",
    `Open resource requests — ${n(s.resourceRequests.requested)} requested, ${n(
      s.resourceRequests.enroute,
    )} en route, ${n(s.resourceRequests.assigned)} assigned, ${n(
      s.resourceRequests.ready,
    )} ready.`,
  );

  return out;
}

/** Coerce a stored date/ISO string to a `<input type=date>` value (YYYY-MM-DD). */
function toDateInput(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Coerce a stored date/ISO string to a `<input type=datetime-local>` value. */
function toDateTimeInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
