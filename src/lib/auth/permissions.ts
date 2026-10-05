import { INCIDENT_AREAS, MODULES } from "@/lib/navigation/modules";

/**
 * Module-level visibility model. Regional admins restrict which incident modules
 * a role sees; the "who sees what" unit is the module slug.
 *
 * Pure data (no server imports) so it's safe in client components too.
 */

// Always visible so a user is never left with a blank workspace.
export const ALWAYS_ON = new Set<string>([""]); // the Overview dashboard

export type PermModule = {
  slug: string;
  label: string;
  areaId: string;
  areaLabel: string;
};

/** Every restrictable module, grouped by area, in navigation order. */
export const PERMISSION_MODULES: PermModule[] = INCIDENT_AREAS.flatMap((area) =>
  area.moduleSlugs
    .filter((slug) => !ALWAYS_ON.has(slug))
    .map((slug) => {
      const m = MODULES.find((x) => x.slug === slug);
      return { slug, label: m?.label ?? slug, areaId: area.id, areaLabel: area.label };
    }),
);

export const ALL_MODULE_SLUGS: string[] = PERMISSION_MODULES.map((m) => m.slug);
const ALL_SET = new Set(ALL_MODULE_SLUGS);

/**
 * Resolve the set of module slugs a role may see.
 * @param dbModules the stored allow-list for this (tenant, role), or null if the
 *   tenant hasn't customized this role — in which case the role sees everything.
 */
export function resolveAllowed(dbModules: string[] | null | undefined): Set<string> {
  const base = dbModules ?? ALL_MODULE_SLUGS; // no row → default open
  const allowed = new Set<string>(ALWAYS_ON);
  for (const slug of base) if (ALL_SET.has(slug)) allowed.add(slug);
  return allowed;
}

/** Sanitize a client-supplied module list down to known, restrictable slugs. */
export function sanitizeModules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((s): s is string => typeof s === "string" && ALL_SET.has(s)))];
}
