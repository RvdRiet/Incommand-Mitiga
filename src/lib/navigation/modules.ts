import type { ComponentType } from "react";

import {
  IconCalendar,
  IconDashboard,
  IconGear,
  IconList,
  IconMap,
  IconUsers,
} from "@/components/dashboard/icons";

export type ModuleIcon = ComponentType<{ className?: string }>;

export type IncidentModule = {
  slug: string;
  label: string;
  icon: ModuleIcon;
  group: "primary" | "tasks" | "operations" | "info" | "footer";
};

/** @deprecated Use eventHref from @/lib/events/store */
export const INCIDENT_BASE = "/dashboard";

export function moduleHref(eventId: string, slug: string) {
  return slug
    ? `/events/${eventId}/dashboard/${slug}`
    : `/events/${eventId}/dashboard`;
}

export const PRIMARY_MODULES: IncidentModule[] = [
  { slug: "", label: "Dashboard", icon: IconDashboard, group: "primary" },
  { slug: "situation", label: "Situation", icon: IconList, group: "primary" },
  { slug: "calendar", label: "Calendar", icon: IconCalendar, group: "primary" },
  { slug: "roles", label: "Roles", icon: IconUsers, group: "primary" },
  { slug: "forms", label: "Forms", icon: IconList, group: "primary" },
  { slug: "map", label: "Map", icon: IconMap, group: "primary" },
  { slug: "logs", label: "Logs", icon: IconList, group: "primary" },
  { slug: "briefings", label: "Briefings", icon: IconList, group: "primary" },
];

export const TASK_MODULE: IncidentModule = {
  slug: "tasks",
  label: "Task boards",
  icon: IconList,
  group: "tasks",
};

export const D4H_EXTRA_MODULES: IncidentModule[] = [
  { slug: "status-boards", label: "Status boards", icon: IconList, group: "tasks" },
  { slug: "plays", label: "Plays", icon: IconList, group: "tasks" },
  { slug: "notifications", label: "Notifications", icon: IconUsers, group: "info" },
];

export const OPERATIONS_MODULES: IncidentModule[] = [
  { slug: "damage-assessment", label: "Damage Assessment", icon: IconList, group: "operations" },
  { slug: "residents", label: "Residents", icon: IconUsers, group: "operations" },
  { slug: "resource-requests", label: "Resource Requests", icon: IconList, group: "operations" },
  { slug: "road-damages", label: "Road Damages", icon: IconList, group: "operations" },
  { slug: "shelters", label: "Shelters", icon: IconList, group: "operations" },
  { slug: "utilities-electricity", label: "Utilities - Electricity", icon: IconList, group: "operations" },
];

export const INFO_MODULES: IncidentModule[] = [
  { slug: "personnel", label: "Personnel", icon: IconUsers, group: "info" },
  { slug: "weather", label: "Weather", icon: IconList, group: "info" },
  { slug: "library", label: "Library", icon: IconList, group: "info" },
  { slug: "map-annotations", label: "Map Annotations", icon: IconMap, group: "info" },
];

export const SETTINGS_MODULE: IncidentModule = {
  slug: "settings",
  label: "Incident Settings",
  icon: IconGear,
  group: "footer",
};

export const ALL_MODULES: IncidentModule[] = [
  ...PRIMARY_MODULES,
  TASK_MODULE,
  ...D4H_EXTRA_MODULES,
  ...OPERATIONS_MODULES,
  ...INFO_MODULES,
  SETTINGS_MODULE,
];

export function getModuleBySlug(slug: string | undefined): IncidentModule | undefined {
  const normalized = slug ?? "";
  return ALL_MODULES.find((m) => m.slug === normalized);
}

