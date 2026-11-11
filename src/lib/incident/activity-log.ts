import type { StoreApi } from "zustand";

import type { IncidentStore } from "./store";
import type { IncidentState, LogEntry } from "./types";
import { newId, nowIso } from "./id";

export const MAX_ACTIVITY_LOG_ENTRIES = 4000;

/** Log kinds that are pure UI noise (legacy click/focus/page-view capture). */
export const HIDDEN_LOG_KINDS = new Set<string>(["ui", "navigation"]);
/** Legacy pre-rework actions/messages to hide (clicks, field focus, page views). */
export const LEGACY_NOISE_ACTION = /^(Click|Field (focused|changed|updated)|Page viewed)\b/;

/**
 * Whether a log entry is a meaningful, account-attributed event worth surfacing —
 * used by BOTH the dashboard "Live activity" feed and the Logs view so they agree
 * and neither shows legacy click/focus/navigation bloat.
 */
export function isMeaningfulLog(entry: { kind?: string | null; message?: string }): boolean {
  if (HIDDEN_LOG_KINDS.has(entry.kind ?? "system")) return false;
  if (entry.message && LEGACY_NOISE_ACTION.test(entry.message)) return false;
  return true;
}

export type ActivityRecord = {
  message: string;
  tags?: string[];
  author?: string;
  kind?: LogEntry["kind"];
  target?: string;
  detail?: string;
};

let suppressStoreActivity = false;

export function runWithoutStoreActivityLog(fn: () => void) {
  suppressStoreActivity = true;
  try {
    fn();
  } finally {
    suppressStoreActivity = false;
  }
}

function truncate(value: string, max = 120): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "(empty)";
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return truncate(JSON.stringify(value));
}

export function describeClickTarget(el: Element): { target: string; detail?: string } {
  const labeled = el.closest(
    "[aria-label], [data-activity-label], button, a, label, [role='button'], [role='tab']",
  ) as HTMLElement | null;
  const node = labeled ?? (el as HTMLElement);
  const tag = node.tagName.toLowerCase();
  const aria = node.getAttribute("aria-label");
  const dataLabel = node.getAttribute("data-activity-label");
  const text = truncate(node.textContent ?? "", 60);
  const href = tag === "a" ? (node as HTMLAnchorElement).getAttribute("href") : null;
  const name = node.getAttribute("name");
  const id = node.id ? `#${node.id}` : "";
  const cls =
    typeof node.className === "string"
      ? node.className
          .split(/\s+/)
          .filter((c) => c.startsWith("ic-"))
          .slice(0, 2)
          .join(".")
      : "";

  const target =
    dataLabel ||
    aria ||
    (text && text.length > 1 ? text : null) ||
    name ||
    `${tag}${id}${cls ? `.${cls}` : ""}`;

  const detail = href ? `href=${href}` : undefined;
  return { target: truncate(target, 80), detail };
}

export function describeFieldChange(el: Element): { target: string; detail: string } | null {
  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement) &&
    !(el instanceof HTMLSelectElement)
  ) {
    return null;
  }

  const input = el;
  if (input.type === "password") {
    return { target: fieldLabel(input), detail: "(password changed)" };
  }

  const label = fieldLabel(input);
  let value = "";
  if (input instanceof HTMLSelectElement) {
    value = input.options[input.selectedIndex]?.text ?? input.value;
  } else if (input instanceof HTMLInputElement && (input.type === "checkbox" || input.type === "radio")) {
    value = input.checked ? "checked" : "unchecked";
  } else {
    value = input.value;
  }

  return {
    target: label,
    detail: formatValue(value),
  };
}

function fieldLabel(el: HTMLElement): string {
  const id = el.id;
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return truncate(label.textContent, 60);
  }
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const span = parentLabel.querySelector("span");
    if (span?.textContent) return truncate(span.textContent, 60);
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return truncate(aria, 60);
  const name = el.getAttribute("name");
  if (name) return name;
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return truncate(placeholder, 60);
  return el.tagName.toLowerCase();
}

function countDelta(before: number, after: number, label: string): string | null {
  if (before === after) return null;
  const d = after - before;
  return `${label} ${d > 0 ? "+" : ""}${d} (now ${after})`;
}

function summarizeStateChange(prev: IncidentState, next: IncidentState): string | null {
  const parts: string[] = [];

  const situationKeys = Object.keys(next.situation) as (keyof IncidentState["situation"])[];
  for (const key of situationKeys) {
    if (prev.situation[key] !== next.situation[key]) {
      parts.push(`situation.${key}=${formatValue(next.situation[key])}`);
    }
  }

  const countFields: { key: keyof IncidentState; label: string }[] = [
    { key: "personnel", label: "personnel" },
    { key: "forms", label: "forms" },
    { key: "taskLists", label: "task lists" },
    { key: "damages", label: "damages" },
    { key: "residents", label: "residents" },
    { key: "residentAreas", label: "resident areas" },
    { key: "resourceRequests", label: "resource requests" },
    { key: "roadDamages", label: "road damages" },
    { key: "shelters", label: "shelters" },
    { key: "utilities", label: "utilities" },
    { key: "library", label: "library" },
    { key: "mapAnnotations", label: "map layers" },
    { key: "supplyRoutes", label: "routes" },
    { key: "calendarEvents", label: "calendar" },
    { key: "operationalPeriods", label: "operational periods" },
    { key: "notifications", label: "notifications" },
    { key: "contactGroups", label: "contacts" },
  ];

  for (const { key, label } of countFields) {
    const b = prev[key];
    const a = next[key];
    if (Array.isArray(b) && Array.isArray(a) && b.length !== a.length) {
      const delta = countDelta(b.length, a.length, label);
      if (delta) parts.push(delta);
    }
  }

  if (prev.settings !== next.settings) {
    const settingKeys = Object.keys(next.settings) as (keyof IncidentState["settings"])[];
    for (const key of settingKeys) {
      if (prev.settings[key] !== next.settings[key]) {
        parts.push(`settings.${key}=${formatValue(next.settings[key])}`);
      }
    }
  }

  if (prev.roleGroups !== next.roleGroups) {
    const prevRoles = prev.roleGroups.reduce((n, g) => n + g.roles.length, 0);
    const nextRoles = next.roleGroups.reduce((n, g) => n + g.roles.length, 0);
    if (prev.roleGroups.length !== next.roleGroups.length) {
      parts.push(countDelta(prev.roleGroups.length, next.roleGroups.length, "role groups")!);
    }
    if (prevRoles !== nextRoles) {
      parts.push(countDelta(prevRoles, nextRoles, "roles")!);
    }
  }

  if (prev.statusBoards !== next.statusBoards) {
    parts.push("status board updated");
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function appendActivityLog(
  set: (fn: (s: IncidentState) => Partial<IncidentState>) => void,
  record: ActivityRecord,
) {
  const entry: LogEntry = {
    id: newId(),
    message: record.message,
    tags: ["activity", ...(record.tags ?? [])],
    author: record.author ?? "System",
    createdAt: nowIso(),
    kind: record.kind ?? "system",
    target: record.target,
    detail: record.detail,
  };

  const auditAction = record.detail
    ? `${record.message} — ${record.detail}`
    : record.message;

  set((s) => {
    const logs = [entry, ...s.logs].slice(0, MAX_ACTIVITY_LOG_ENTRIES);
    const audit = [
      {
        id: newId(),
        actor: entry.author,
        action: truncate(auditAction, 200),
        createdAt: entry.createdAt,
      },
      ...s.audit,
    ].slice(0, MAX_ACTIVITY_LOG_ENTRIES);
    return { logs, audit };
  });
}

export function attachIncidentActivityLogger(store: StoreApi<IncidentStore>) {
  let prevState = store.getState();

  store.subscribe((state) => {
    if (suppressStoreActivity) {
      prevState = state;
      return;
    }

    const summary = summarizeStateChange(prevState, state);
    prevState = state;

    if (!summary) return;

    runWithoutStoreActivityLog(() => {
      store.getState().recordActivity({
        message: "Data changed",
        tags: ["data", "store"],
        kind: "data",
        target: "incident state",
        detail: summary,
      });
    });
  });
}
