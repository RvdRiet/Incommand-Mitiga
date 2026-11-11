/**
 * Linked ICS forms — "enter once, fills everywhere".
 *
 * Derives the shared field values (incident name, dates, operational period,
 * objectives, situation summary, command org) from live incident data so every
 * structured ICS form auto-populates them. Matches D4H's linked-fields behaviour.
 *
 * The result is merged UNDER a form's own saved fields (explicit edits win), so a
 * field the user has typed into keeps their value, while untouched fields stay
 * linked to the incident and update when the incident does. Field ids cover both
 * the generic-layout naming (dateTime/operationalPeriod/currentSituation) and the
 * FEMA-layout naming (dateInitiated/opDateFrom/situationSummary); layouts read
 * only the ids they use and ignore the rest.
 */

type LinkSource = {
  situation: { name?: string; startDate?: string; summary?: string; objectives?: string };
  operationalPeriods: { number?: number; startsAt?: string; endsAt?: string }[];
  roleGroups: { roles: { title?: string; personnelId?: string | null }[] }[];
  personnel: { id: string; name?: string }[];
};

/** The ICS-201 §9 command-org positions, and the title matchers that map free-text Role titles onto them. */
const ORG_MATCHERS: Record<string, (title: string) => boolean> = {
  incidentCommander: (t) => t.includes("incident commander") || t.includes("commander"),
  liaisonOfficer: (t) => t.includes("liaison"),
  safetyOfficer: (t) => t.includes("safety"),
  publicInfoOfficer: (t) =>
    t.includes("public information") || t.includes("public info") || t.includes("pio"),
  planningChief: (t) => t.includes("planning"),
  operationsChief: (t) => t.includes("operations") || t.includes("operational"),
  logisticsChief: (t) => t.includes("logistics"),
  financeChief: (t) => t.includes("finance") || t.includes("admin"),
};

/** Split a stored ISO-ish timestamp into date (YYYY-MM-DD) + time (HH:mm) by slicing — no Date parsing, so no timezone drift. */
function splitDateTime(iso?: string): { date: string; time: string } {
  if (!iso || typeof iso !== "string") return { date: "", time: "" };
  const date = iso.length >= 10 ? iso.slice(0, 10) : "";
  const time = iso.length >= 16 && iso[10] === "T" ? iso.slice(11, 16) : "";
  return { date, time };
}

/** The active operational period (now within its window), else the latest, else the first. */
function currentOpPeriod(periods: LinkSource["operationalPeriods"]) {
  if (!periods || periods.length === 0) return undefined;
  const now = Date.now();
  const active = periods.find((p) => {
    const s = p.startsAt ? Date.parse(p.startsAt) : NaN;
    const e = p.endsAt ? Date.parse(p.endsAt) : NaN;
    return !Number.isNaN(s) && !Number.isNaN(e) && now >= s && now <= e;
  });
  if (active) return active;
  return [...periods].sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""))[0];
}

/** The set of field ids this module manages (useful for tests / callers that want to know what's linked). */
export const LINKED_FIELD_IDS = [
  "incidentName",
  "dateTime",
  "dateInitiated",
  "timeInitiated",
  "operationalPeriod",
  "opDateFrom",
  "opDateTo",
  "opTimeFrom",
  "opTimeTo",
  "objectives",
  "currentSituation",
  "situationSummary",
  ...Object.keys(ORG_MATCHERS),
] as const;

/** Build the map of incident-derived values for the linkable ICS-form fields. Only non-empty values are returned. */
export function deriveLinkedFields(src: LinkSource): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (id: string, v?: string) => {
    if (v && v.trim()) out[id] = v;
  };

  const sit = src.situation ?? {};
  put("incidentName", sit.name);
  put("objectives", sit.objectives);
  put("currentSituation", sit.summary);
  put("situationSummary", sit.summary);

  const { date: sd, time: st } = splitDateTime(sit.startDate);
  put("dateTime", sit.startDate);
  put("dateInitiated", sd);
  put("timeInitiated", st);

  const op = currentOpPeriod(src.operationalPeriods ?? []);
  if (op) {
    const from = splitDateTime(op.startsAt);
    const to = splitDateTime(op.endsAt);
    put("opDateFrom", from.date);
    put("opTimeFrom", from.time);
    put("opDateTo", to.date);
    put("opTimeTo", to.time);
    const label = [from.date, from.time].filter(Boolean).join(" ");
    const labelTo = [to.date, to.time].filter(Boolean).join(" ");
    put("operationalPeriod", [label, labelTo].filter(Boolean).join(" – "));
  }

  // Command org (ICS-201 §9) from the Roles module.
  const nameById = new Map((src.personnel ?? []).map((p) => [p.id, p.name ?? ""]));
  const roles = (src.roleGroups ?? []).flatMap((g) => g.roles ?? []);
  for (const [position, matches] of Object.entries(ORG_MATCHERS)) {
    const match = roles.find((r) => r.title && matches(r.title.toLowerCase()));
    if (!match) continue;
    const name = match.personnelId ? nameById.get(match.personnelId) ?? "" : "";
    put(position, name);
  }

  return out;
}
