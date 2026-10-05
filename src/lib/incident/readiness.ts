import { certStatus } from "./certifications";
import { computeFatigue, type FatigueLevel, type FatigueRules } from "./fatigue";
import type { Certification, FieldUnit, Personnel, RoleGroup, Shift } from "./types";

/** ready = clear to deploy · caution = deployable with a warning · blocked = a hard flag
 *  (over the fatigue limit or an expired certification). */
export type ReadyLevel = "ready" | "caution" | "blocked";

export type PersonReadiness = {
  fatigueLevel: FatigueLevel | null;
  onDuty: boolean;
  expiredCerts: number;
  expiringCerts: number;
  /** Assigned ICS role title, if any. */
  role: string | null;
  /** Assigned field-unit callsign, if any. */
  unitCallsign: string | null;
  level: ReadyLevel;
  issues: string[];
};

export type ReadinessData = {
  shifts: Shift[];
  certifications: Certification[];
  roleGroups: RoleGroup[];
  fieldUnits: FieldUnit[];
};

const RANK: Record<ReadyLevel, number> = { ready: 0, caution: 1, blocked: 2 };
function escalate(current: ReadyLevel, next: ReadyLevel): ReadyLevel {
  return RANK[next] > RANK[current] ? next : current;
}

/**
 * Fuse a person's fatigue (from their shifts) and certifications with their current
 * assignment into one deployment-readiness verdict. This is the seam that lets Roles,
 * Personnel, Field Units and Analytics all speak the same "is this person fit to deploy?"
 * language instead of each module reading a slice in isolation.
 */
export function personReadiness(
  personnelId: string,
  data: ReadinessData,
  rules: FatigueRules,
  certReminderDays: number,
  now: number = Date.now(),
): PersonReadiness {
  const issues: string[] = [];
  let level: ReadyLevel = "ready";

  // Fatigue
  const personShifts = data.shifts.filter((s) => s.personnelId === personnelId);
  const fatigue = personShifts.length ? computeFatigue(personShifts, rules, now) : null;
  if (fatigue?.level === "critical") {
    issues.push("Over fatigue limit");
    level = escalate(level, "blocked");
  } else if (fatigue?.level === "warning") {
    issues.push("Fatigue warning");
    level = escalate(level, "caution");
  }

  // Certifications
  let expiredCerts = 0;
  let expiringCerts = 0;
  for (const c of data.certifications) {
    if (c.personnelId !== personnelId) continue;
    const st = certStatus(c.expiresAt, now, certReminderDays);
    if (st.status === "expired") expiredCerts++;
    else if (st.status === "expiring") expiringCerts++;
  }
  if (expiredCerts > 0) {
    issues.push(`${expiredCerts} expired cert${expiredCerts > 1 ? "s" : ""}`);
    level = escalate(level, "blocked");
  } else if (expiringCerts > 0) {
    issues.push(`${expiringCerts} cert${expiringCerts > 1 ? "s" : ""} expiring`);
    level = escalate(level, "caution");
  }

  // Assignment
  let role: string | null = null;
  for (const g of data.roleGroups) {
    const r = g.roles.find((x) => x.personnelId === personnelId);
    if (r) {
      role = r.title || "Assigned role";
      break;
    }
  }
  const unitCallsign =
    data.fieldUnits.find((u) => u.personnelId === personnelId)?.callsign ?? null;

  return {
    fatigueLevel: fatigue?.level ?? null,
    onDuty: !!fatigue?.onDutyNow,
    expiredCerts,
    expiringCerts,
    role,
    unitCallsign,
    level,
    issues,
  };
}

export type CrewReadinessSummary = {
  total: number;
  ready: number;
  caution: number;
  blocked: number;
  onDuty: number;
  fatigued: number;
  expiredCerts: number;
  expiringCerts: number;
};

/** Roll individual readiness up into incident-wide crew figures (for Analytics). */
export function crewReadinessSummary(
  personnel: Personnel[],
  data: ReadinessData,
  rules: FatigueRules,
  certReminderDays: number,
  now: number = Date.now(),
): CrewReadinessSummary {
  const per = personnel.map((p) => personReadiness(p.id, data, rules, certReminderDays, now));
  return {
    total: personnel.length,
    ready: per.filter((x) => x.level === "ready").length,
    caution: per.filter((x) => x.level === "caution").length,
    blocked: per.filter((x) => x.level === "blocked").length,
    onDuty: per.filter((x) => x.onDuty).length,
    fatigued: per.filter((x) => x.fatigueLevel === "warning" || x.fatigueLevel === "critical").length,
    expiredCerts: per.reduce((s, x) => s + x.expiredCerts, 0),
    expiringCerts: per.reduce((s, x) => s + x.expiringCerts, 0),
  };
}

export const READY_LABEL: Record<ReadyLevel, string> = {
  ready: "Ready",
  caution: "Caution",
  blocked: "Not deployable",
};
