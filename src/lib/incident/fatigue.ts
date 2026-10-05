import type { Shift } from "./types";

export type FatigueRules = {
  maxShiftHours: number;
  maxOnDuty24h: number;
  minRestHours: number;
};

export const DEFAULT_FATIGUE_RULES: FatigueRules = {
  maxShiftHours: 12,
  maxOnDuty24h: 16,
  minRestHours: 8,
};

/** rested = off duty, adequate rest · on-duty = working, within limits · warning = nearing a
 *  limit · critical = a fatigue limit has been breached (do not deploy). */
export type FatigueLevel = "rested" | "on-duty" | "warning" | "critical";

export type PersonFatigue = {
  onDutyNow: boolean;
  /** Length of the shift currently covering `now`, in hours (0 if off duty). */
  currentShiftHours: number;
  /** On-duty hours within the last rolling 24 h. */
  hours24h: number;
  /** Hours of rest since the last shift ended (null if on duty or no prior shift). */
  restHours: number | null;
  /** Total scheduled hours across all shifts. */
  totalHours: number;
  level: FatigueLevel;
  reasons: string[];
};

const HOUR = 3_600_000;

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** Duration of a shift in hours (0 if malformed or negative). */
export function shiftHours(shift: Pick<Shift, "startsAt" | "endsAt">): number {
  const a = ms(shift.startsAt);
  const b = ms(shift.endsAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / HOUR;
}

/** Overlap (hours) between a shift and the window [from, to]. */
function overlapHours(shift: Pick<Shift, "startsAt" | "endsAt">, from: number, to: number): number {
  const a = ms(shift.startsAt);
  const b = ms(shift.endsAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  const lo = Math.max(a, from);
  const hi = Math.min(b, to);
  return hi > lo ? (hi - lo) / HOUR : 0;
}

/** Compute a person's fatigue snapshot from their shifts. */
export function computeFatigue(
  personShifts: Shift[],
  rules: FatigueRules,
  now: number = Date.now(),
): PersonFatigue {
  const valid = personShifts.filter((s) => shiftHours(s) > 0);
  const reasons: string[] = [];

  const current = valid.find((s) => {
    const a = ms(s.startsAt);
    const b = ms(s.endsAt);
    return now >= a && now < b;
  });
  const onDutyNow = !!current;
  const currentShiftHours = current ? Math.max(0, (now - ms(current.startsAt)) / HOUR) : 0;

  const hours24h = valid.reduce((sum, s) => sum + overlapHours(s, now - 24 * HOUR, now), 0);
  const totalHours = valid.reduce((sum, s) => sum + shiftHours(s), 0);

  // Rest since the most recent completed shift.
  let restHours: number | null = null;
  if (!onDutyNow) {
    const ended = valid
      .filter((s) => ms(s.endsAt) <= now)
      .sort((a, b) => ms(b.endsAt) - ms(a.endsAt));
    if (ended.length > 0) restHours = Math.max(0, (now - ms(ended[0].endsAt)) / HOUR);
  }

  let level: FatigueLevel = onDutyNow ? "on-duty" : "rested";
  const bump = (l: FatigueLevel) => {
    const order: FatigueLevel[] = ["rested", "on-duty", "warning", "critical"];
    if (order.indexOf(l) > order.indexOf(level)) level = l;
  };

  const r1 = round(currentShiftHours);
  if (onDutyNow && currentShiftHours >= rules.maxShiftHours) {
    reasons.push(`On shift ${r1} h — over the ${rules.maxShiftHours} h limit`);
    bump("critical");
  } else if (onDutyNow && currentShiftHours >= rules.maxShiftHours * 0.8) {
    reasons.push(`On shift ${r1} h — nearing the ${rules.maxShiftHours} h limit`);
    bump("warning");
  }

  const r2 = round(hours24h);
  if (hours24h >= rules.maxOnDuty24h) {
    reasons.push(`${r2} h on duty in 24 h — over the ${rules.maxOnDuty24h} h cap`);
    bump("critical");
  } else if (hours24h >= rules.maxOnDuty24h * 0.8) {
    reasons.push(`${r2} h on duty in 24 h — nearing the ${rules.maxOnDuty24h} h cap`);
    bump("warning");
  }

  if (!onDutyNow && restHours != null && restHours < rules.minRestHours) {
    reasons.push(`Only ${round(restHours)} h rest — needs ${rules.minRestHours} h before redeploy`);
    bump("warning");
  }

  return { onDutyNow, currentShiftHours, hours24h, restHours, totalHours, level, reasons };
}

function round(h: number): number {
  return Math.round(h * 10) / 10;
}

export const FATIGUE_LABEL: Record<FatigueLevel, string> = {
  rested: "Rested",
  "on-duty": "On duty",
  warning: "Fatigue warning",
  critical: "Over limit",
};
