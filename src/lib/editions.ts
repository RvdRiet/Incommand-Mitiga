import {
  getAreaByHubSlug,
  isHubSlug,
} from "@/lib/navigation/modules";

/**
 * Product editions — one codebase, many packagings.
 *
 * An edition is a build-time allow-list of module slugs. The FULL edition is the
 * complete platform (everything we have); COMMAND_CORE is the cut-down beta that
 * replaces D4H's core incident-management feature set and hides the rest. Nothing
 * is removed from the build — out-of-edition modules are simply hidden from the
 * nav and 404'd at the route, so flipping the edition unlocks them instantly with
 * no migration and no fork to maintain.
 *
 * Select at deploy time with NEXT_PUBLIC_EDITION=command_core (defaults to full).
 * The slug is NEXT_PUBLIC_ so it is readable in client nav as well as on the server.
 *
 * To change what a customer's beta includes, edit COMMAND_CORE_MODULES below — it
 * is the single source of truth. Slugs match src/lib/navigation/modules.ts.
 */

export type EditionId = "full" | "command_core";

/**
 * Command Core = the D4H-replacement scope. In: incident picture, ICS forms &
 * plans, tasks/boards, the full people-&-resources stack, and records.
 * Out (for now): analytics, track-history, outages, the disaster mass-care modules
 * (damage assessment, road damages, residents, shelters, utilities), standalone
 * notifications, Live Ops comms, and the device registry — all still shipped, just
 * not surfaced in this edition.
 *
 * Standalone pages (not nav modules) are gated by the same allow-list via their own
 * pseudo-slug: "devices" (the bodycam registry) is intentionally absent here so it
 * hides in Command Core and returns in Full. See STANDALONE_PAGE_SLUGS below.
 */
export const COMMAND_CORE_MODULES: readonly string[] = [
  // Situation
  "situation",
  "map",
  "weather",
  "map-annotations",
  // Plans & Forms
  "forms",
  "calendar",
  "briefings",
  "plays",
  // Operations
  "tasks",
  "status-boards",
  // People & Resources
  "roles",
  "personnel",
  "rostering",
  "certifications",
  "resource-requests",
  "inventory",
  // Records
  "logs",
  "library",
];

/**
 * Pseudo-slugs for standalone pages (reachable outside the event nav, e.g. from the
 * events landing) that the edition allow-list also gates. They are never real nav
 * modules, so they only need to be excluded from an edition's list to hide them.
 * Used by isModuleInEdition for page-level gating (e.g. the /devices registry).
 */
export const STANDALONE_PAGE_SLUGS = ["devices"] as const;

/** Slugs always available in every edition (never gated). */
const ALWAYS_IN_EDITION = new Set<string>(["", "settings"]);

type Edition = {
  id: EditionId;
  label: string;
  /** null = every module (full platform); otherwise the allow-list. */
  moduleSlugs: readonly string[] | null;
};

export const EDITIONS: Record<EditionId, Edition> = {
  full: { id: "full", label: "InCommand Mitiga", moduleSlugs: null },
  command_core: {
    id: "command_core",
    label: "InCommand Command Core",
    moduleSlugs: COMMAND_CORE_MODULES,
  },
};

/** The active edition for this build (from NEXT_PUBLIC_EDITION; defaults to full). */
export function getActiveEdition(): Edition {
  const raw = (process.env.NEXT_PUBLIC_EDITION ?? "").trim().toLowerCase();
  return raw === "command_core" ? EDITIONS.command_core : EDITIONS.full;
}

/** The allow-list for the active edition, or null when the full platform is active. */
function activeAllowList(): Set<string> | null {
  const slugs = getActiveEdition().moduleSlugs;
  return slugs ? new Set(slugs) : null;
}

/**
 * Is a MODULE (a leaf nav slug, including "" for the dashboard) part of the active
 * edition? Used to filter the sidebar, area hubs and any module link.
 */
export function isModuleInEdition(slug: string): boolean {
  const allow = activeAllowList();
  if (!allow) return true;
  if (ALWAYS_IN_EDITION.has(slug)) return true;
  return allow.has(slug);
}

/**
 * Is a ROUTE reachable in the active edition? Like isModuleInEdition but also
 * resolves area hub slugs (a hub is reachable only while its area still has at
 * least one in-edition module). The server route guard uses this to 404 hidden
 * modules and now-empty hubs.
 */
export function isRouteInEdition(slug: string): boolean {
  const allow = activeAllowList();
  if (!allow) return true;
  if (ALWAYS_IN_EDITION.has(slug)) return true;
  if (isHubSlug(slug)) {
    const area = getAreaByHubSlug(slug);
    return !!area && area.moduleSlugs.some((s) => allow.has(s));
  }
  return allow.has(slug);
}
