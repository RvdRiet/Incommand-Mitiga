import type { ComponentType } from "react";

import {
  IconActivity,
  IconArchive,
  IconAward,
  IconBell,
  IconBook,
  IconBoxes,
  IconCalendar,
  IconChart,
  IconCheckSquare,
  IconClipboard,
  IconClock,
  IconCompass,
  IconDashboard,
  IconFileText,
  IconFolder,
  IconGear,
  IconHome,
  IconIdCard,
  IconLayers,
  IconMap,
  IconMapPin,
  IconMegaphone,
  IconPackage,
  IconPlay,
  IconRadio,
  IconRadioTower,
  IconRoad,
  IconRoute,
  IconSitemap,
  IconSun,
  IconTent,
  IconTriangleAlert,
  IconTruck,
  IconUsers,
  IconZap,
  IconZapOff,
} from "@/components/dashboard/icons";

export type ModuleIcon = ComponentType<{ className?: string }>;

export type IncidentModule = {
  slug: string;
  label: string;
  icon: ModuleIcon;
  /** One-line, plain-language explanation shown on area hub cards. */
  description?: string;
  group: "primary" | "tasks" | "operations" | "info" | "footer" | "hub";
};

/** @deprecated Use eventHref from @/lib/events/store */
export const INCIDENT_BASE = "/dashboard";

export function moduleHref(eventId: string, slug: string) {
  return slug
    ? `/events/${eventId}/dashboard/${slug}`
    : `/events/${eventId}/dashboard`;
}

/**
 * Every module in the system. This is the flat catalogue used for routing, labels and
 * the "add" toolbar. How they are *grouped and surfaced* for navigation lives in
 * INCIDENT_AREAS below — that is the newcomer-facing information architecture.
 */
export const MODULES: IncidentModule[] = [
  // Overview
  { slug: "", label: "Dashboard", icon: IconDashboard, group: "primary", description: "At-a-glance command picture — key numbers and live widgets." },
  { slug: "analytics", label: "Analytics", icon: IconChart, group: "info", description: "Command posture and cross-module reporting." },
  // Situation
  { slug: "situation", label: "Situation", icon: IconFileText, group: "primary", description: "The incident brief — what happened, where, and objectives." },
  { slug: "map", label: "Map", icon: IconMap, group: "primary", description: "Common operating picture on a live map." },
  { slug: "weather", label: "Weather", icon: IconSun, group: "info", description: "Forecast and conditions for the incident location." },
  { slug: "map-annotations", label: "Map Annotations", icon: IconMapPin, group: "info", description: "Zones, markers and drawings placed on the map." },
  { slug: "track-history", label: "Track History", icon: IconRoute, group: "primary", description: "Replay where units and assets have been." },
  { slug: "outages", label: "Outage Map", icon: IconZapOff, group: "operations", description: "Power outage areas plotted geographically." },
  // Plans & Forms
  { slug: "forms", label: "Forms", icon: IconClipboard, group: "primary", description: "ICS forms — 201, 202, 205, 209 and more." },
  { slug: "calendar", label: "Calendar", icon: IconCalendar, group: "primary", description: "Operational periods and scheduled events." },
  { slug: "briefings", label: "Briefings", icon: IconMegaphone, group: "primary", description: "Prepared briefings and situation updates." },
  { slug: "plays", label: "Plays", icon: IconPlay, group: "tasks", description: "Reusable response playbooks and checklists." },
  // Operations
  { slug: "tasks", label: "Task boards", icon: IconCheckSquare, group: "tasks", description: "Assign and track work across the response." },
  { slug: "status-boards", label: "Status boards", icon: IconLayers, group: "tasks", description: "Kanban boards for tracking anything by status." },
  { slug: "damage-assessment", label: "Damage Assessment", icon: IconTriangleAlert, group: "operations", description: "Log and classify structural damage." },
  { slug: "road-damages", label: "Road Damages", icon: IconRoad, group: "operations", description: "Road closures and access status." },
  { slug: "residents", label: "Residents", icon: IconHome, group: "operations", description: "Affected population and impact areas." },
  { slug: "shelters", label: "Shelters", icon: IconTent, group: "operations", description: "Shelter locations and occupancy." },
  { slug: "utilities-electricity", label: "Utilities — Electricity", icon: IconZap, group: "operations", description: "Power utilities and customers without power." },
  // People & Resources
  { slug: "roles", label: "Roles", icon: IconSitemap, group: "primary", description: "ICS org chart — who holds which command role." },
  { slug: "personnel", label: "Personnel", icon: IconIdCard, group: "info", description: "Responder roster and deployment readiness." },
  { slug: "rostering", label: "Rostering", icon: IconClock, group: "operations", description: "Shift scheduling and fatigue tracking." },
  { slug: "certifications", label: "Certifications", icon: IconAward, group: "operations", description: "Qualifications and renewal reminders." },
  { slug: "resource-requests", label: "Resource Requests", icon: IconPackage, group: "operations", description: "Request and track resources and supplies." },
  { slug: "inventory", label: "Inventory", icon: IconBoxes, group: "operations", description: "Stock and gear on hand, with expiry and maintenance checks." },
  // Comms
  { slug: "comms", label: "Live Ops", icon: IconRadioTower, group: "primary", description: "Channels, field units, paging and distress." },
  { slug: "notifications", label: "Notifications", icon: IconBell, group: "info", description: "System alerts and incident notifications." },
  // Records
  { slug: "logs", label: "Logs", icon: IconActivity, group: "primary", description: "Chronological activity log of the incident." },
  { slug: "library", label: "Library", icon: IconBook, group: "info", description: "Documents, exports and reference files." },
];

export const SETTINGS_MODULE: IncidentModule = {
  slug: "settings",
  label: "Incident Settings",
  icon: IconGear,
  group: "footer",
  description: "Thresholds, defaults and incident configuration.",
};

/**
 * The newcomer-facing information architecture: seven plain-language areas. Each area
 * has a landing "hub" page (except Overview, whose hub is the dashboard itself) that
 * lays out its tools as cards, and the sidebar renders these as labelled, collapsible
 * groups. `moduleSlugs` reference entries in MODULES, in display order.
 */
export type NavArea = {
  id: string;
  label: string;
  icon: ModuleIcon;
  description: string;
  /** Route slug for the area landing page. "" = the dashboard (Overview). */
  hubSlug: string;
  /**
   * Where the sidebar's area label navigates — the area's main workspace, so one click
   * lands on the tool instead of the hub overview. The hub stays reachable via the
   * dashboard area cards and the breadcrumb.
   */
  primarySlug: string;
  moduleSlugs: string[];
};

export const INCIDENT_AREAS: NavArea[] = [
  {
    id: "overview",
    label: "Overview",
    icon: IconDashboard,
    description: "Where you land — the at-a-glance picture of the whole incident.",
    hubSlug: "",
    primarySlug: "",
    moduleSlugs: ["", "analytics"],
  },
  {
    id: "situation",
    label: "Situation",
    icon: IconCompass,
    description: "What is happening and where — the incident picture and the map.",
    hubSlug: "hub-situation",
    primarySlug: "situation",
    moduleSlugs: ["situation", "map", "weather", "map-annotations", "track-history", "outages"],
  },
  {
    id: "plans",
    label: "Plans & Forms",
    icon: IconFolder,
    description: "Objectives, ICS forms, the schedule and reusable playbooks.",
    hubSlug: "hub-plans",
    primarySlug: "forms",
    moduleSlugs: ["forms", "calendar", "briefings", "plays"],
  },
  {
    id: "operations",
    label: "Operations",
    icon: IconTruck,
    description: "The response work — tasks, boards and on-the-ground impact.",
    hubSlug: "hub-operations",
    primarySlug: "tasks",
    moduleSlugs: [
      "tasks",
      "status-boards",
      "damage-assessment",
      "road-damages",
      "residents",
      "shelters",
      "utilities-electricity",
    ],
  },
  {
    id: "people",
    label: "People & Resources",
    icon: IconUsers,
    description: "Who is on the team, whether they are fit to deploy, and what they need.",
    hubSlug: "hub-people",
    primarySlug: "roles",
    moduleSlugs: [
      "roles",
      "personnel",
      "rostering",
      "certifications",
      "resource-requests",
      "inventory",
    ],
  },
  {
    id: "comms",
    label: "Comms",
    icon: IconRadio,
    description: "Talking to the field — live channels, units and notifications.",
    hubSlug: "hub-comms",
    primarySlug: "comms",
    moduleSlugs: ["comms", "notifications"],
  },
  {
    id: "records",
    label: "Records",
    icon: IconArchive,
    description: "The paper trail — activity logs and the document library.",
    hubSlug: "hub-records",
    primarySlug: "logs",
    moduleSlugs: ["logs", "library"],
  },
];

/** Synthetic module entries for each area hub landing page, so routing resolves them. */
export const AREA_HUB_MODULES: IncidentModule[] = INCIDENT_AREAS.filter(
  (a) => a.hubSlug,
).map((a) => ({
  slug: a.hubSlug,
  label: a.label,
  icon: a.icon,
  group: "hub" as const,
  description: a.description,
}));

export const ALL_MODULES: IncidentModule[] = [
  ...MODULES,
  ...AREA_HUB_MODULES,
  SETTINGS_MODULE,
];

const moduleBySlug = new Map(ALL_MODULES.map((m) => [m.slug, m]));

export function getModuleBySlug(slug: string | undefined): IncidentModule | undefined {
  return moduleBySlug.get(slug ?? "");
}

/** The area a module belongs to (for breadcrumbs and hub context). */
export function getAreaForModule(slug: string | undefined): NavArea | undefined {
  const normalized = slug ?? "";
  return INCIDENT_AREAS.find(
    (a) => a.hubSlug === normalized || a.moduleSlugs.includes(normalized),
  );
}

export function getAreaByHubSlug(hubSlug: string): NavArea | undefined {
  return INCIDENT_AREAS.find((a) => a.hubSlug === hubSlug);
}

export function isHubSlug(slug: string): boolean {
  return slug.startsWith("hub-");
}
