import type { IncidentState } from "./types";

/**
 * Maps each incident-state key to the module that owns it, so the sync server can
 * split the monolithic state doc into per-module slices and authorize reads/writes
 * per module. Slugs match src/lib/navigation/modules.ts.
 *
 * Keys not owned by a restrictable module (currently just `settings`) — and any
 * key that isn't mapped — fall into CORE, which is always readable and writable
 * by contributors, so a newly-added state key can never be silently dropped.
 */
export const CORE_MODULE = "__core__";

type StateKey = keyof IncidentState;

export const MODULE_KEYS: Record<string, StateKey[]> = {
  situation: ["situation"],
  personnel: ["personnel"],
  roles: ["roleGroups"],
  logs: ["logs", "audit"],
  forms: ["forms", "customForms"],
  tasks: ["taskLists"],
  "status-boards": ["statusBoards"],
  "damage-assessment": ["damages"],
  residents: ["residents", "residentAreas"],
  "resource-requests": ["resourceRequests"],
  "road-damages": ["roadDamages"],
  shelters: ["shelters"],
  "utilities-electricity": ["utilities"],
  outages: ["outages"],
  library: ["library"],
  "map-annotations": ["mapAnnotations"],
  map: ["supplyRoutes"],
  calendar: ["calendarEvents", "operationalPeriods"],
  notifications: ["notifications", "contactGroups"],
  comms: ["channels", "fieldUnits", "distressEvents", "pages"],
  rostering: ["shifts"],
  certifications: ["certifications"],
  inventory: ["inventory"],
  [CORE_MODULE]: ["settings"],
};

// Reverse index: state key → owning module slug.
const KEY_TO_MODULE = new Map<string, string>();
for (const [slug, keys] of Object.entries(MODULE_KEYS)) {
  for (const k of keys) KEY_TO_MODULE.set(k, slug);
}

const warnedUnmapped = new Set<string>();
export function moduleForKey(key: string): string {
  const slug = KEY_TO_MODULE.get(key);
  if (slug) return slug;
  if (!warnedUnmapped.has(key)) {
    warnedUnmapped.add(key);
    console.warn(`[module-state] unmapped state key "${key}" → treated as core (always synced).`);
  }
  return CORE_MODULE;
}

/** Split a whole state doc into { moduleSlug: { ...that module's keys } }. */
export function splitStateByModule(
  state: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(state)) {
    const slug = moduleForKey(key);
    (out[slug] ??= {})[key] = value;
  }
  return out;
}

/** Merge per-module slices back into a single state doc. */
export function assembleState(
  slices: { moduleSlug: string; state: Record<string, unknown> }[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of slices) Object.assign(out, s.state);
  return out;
}

/** Core is always visible; otherwise the module must be in the role's allow-set. */
export function isModuleReadable(slug: string, allowed: Set<string>): boolean {
  return slug === CORE_MODULE || allowed.has(slug);
}

// Postgres jsonb/text cannot store a NUL byte or a lone UTF-16 surrogate — either
// one makes the whole sync 500 and silently blocks persistence. We strip NULs and
// replace broken surrogates (valid pairs like emoji are kept) before storing.
// The special chars are built at runtime so the source stays plain ASCII.
const NUL_CHAR = String.fromCharCode(0);
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeForJsonb<T>(value: T): T {
  if (typeof value === "string") {
    return value.split(NUL_CHAR).join("").replace(LONE_SURROGATE, REPLACEMENT_CHAR) as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeForJsonb(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeForJsonb(v);
    return out as unknown as T;
  }
  return value;
}
