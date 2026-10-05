"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconCalendar, IconList, IconMap } from "@/components/dashboard/icons";
import { useSession } from "next-auth/react";

import { useEventId } from "@/context/EventContext";
import { moduleHref } from "@/lib/navigation/modules";
import { downloadIncidentExport } from "@/lib/incident/export";
import { downloadAuditTrailTxt } from "@/lib/incident/audit-export";
import { parseFormContent } from "@/lib/incident/ics-forms-catalog";
import { useNow } from "@/lib/devices/presence";
import { personReadiness, READY_LABEL, type ReadinessData } from "@/lib/incident/readiness";
import { IconAlertTriangle, IconInfo, IconRain, IconWind, IconStorm, IconFog, WeatherConditionIcon } from "@/components/ui/icons";
import { IcsFemaForm } from "./ics-forms/IcsFemaForm";
import { sortResidentAreas, type ResidentAreaSortMode } from "@/lib/incident/residents";
import { sortUtilityRows, type UtilitySortMode } from "@/lib/incident/utilities";
import { CENSUS_SOURCE, CENSUS_YEAR, formatPopulation } from "@/lib/sa-population";
import { residentAreaPatchFromCensus, tryAutofillResidentAreaFromCity } from "@/lib/sa-population/resident-area";
import type { ResidentArea } from "@/lib/incident/types";
import { windCompass, type WeatherForecast, type WeatherRisk } from "@/lib/weather";
import { CensusCityField } from "./CensusCityField";
import { useSituationReport } from "./useSituationReport";
import { useOrgRoster } from "@/lib/roster/store";
import { useIncidentStore } from "@/context/EventContext";
import type {
  ActivationLevel,
  AuditEntry,
  DamageStatus,
  IcsFormRecord,
  LogEntry,
  ResourceRequestStatus,
  RoadStatus,
  ShelterStatus,
  TaskItemStatus,
} from "@/lib/incident/types";

import {
  CoordCell,
  formatDate,
  InlineInput,
  InlineSelect,
  RowDelete,
  SortBar,
  StatusFilterBar,
  useSearchFilter,
} from "./shared";
import { EmptyHint, StatusBar, SummaryBar } from "./ui";

export { DashboardHomeView } from "./view-modules/dashboard";
export { FormsView } from "./view-modules/forms";
export { MapView } from "./view-modules/map";

type ViewProps = {
  searchActive?: boolean;
  filterActive?: boolean;
  orgChartOpen?: boolean;
};

/** Blank → null; otherwise clamp a coordinate to ±limit (90 for lat, 180 for lng). */
function parseCoord(raw: string, limit: number): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(limit, Math.max(-limit, n));
}

function filterByStatus<T>(
  rows: T[],
  active: boolean | undefined,
  status: string,
  readStatus: (row: T) => string,
) {
  if (!active || !status) return rows;
  return rows.filter((row) => readStatus(row) === status);
}

function SearchBar({
  active,
  query,
  onQuery,
}: {
  active?: boolean;
  query: string;
  onQuery: (q: string) => void;
}) {
  if (!active) return null;
  return (
    <div className="ic-search-panel">
      <input
        type="search"
        className="ic-search-panel__input"
        placeholder="Filter recordsâ€¦"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus
      />
    </div>
  );
}

const ACTIVATION_LEVELS: {
  value: ActivationLevel;
  label: string;
  hint: string;
}[] = [
  { value: "planning", label: "Planning", hint: "Preparing the response" },
  { value: "activated", label: "Activated", hint: "Full command posture" },
  { value: "closed", label: "Resolved", hint: "Demobilised / complete" },
];

export function SituationView() {
  const eventId = useEventId();
  const situation = useIncidentStore((s) => s.situation);
  const updateSituation = useIncidentStore((s) => s.updateSituation);
  const setActivationLevel = useIncidentStore((s) => s.setActivationLevel);

  const activeLevel =
    ACTIVATION_LEVELS.find((l) => l.value === situation.activationLevel) ??
    ACTIVATION_LEVELS[0];
  const hasCoords = situation.lat != null && situation.lng != null;

  // Resolve the typed location name → coordinates so weather / map / load-shedding
  // work without anyone needing to know the lat/lng. Uses the geocode proxy.
  const [geocodeState, setGeocodeState] = useState<"idle" | "loading" | "none" | "error">("idle");
  const geocodeLocation = async () => {
    const q = situation.location.trim();
    if (!q) return;
    setGeocodeState("loading");
    try {
      const res = await fetch(`/api/map/geocode?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { results: { lat: number; lng: number; label: string }[] };
      const hit = data.results?.[0];
      if (!hit) {
        setGeocodeState("none");
        return;
      }
      updateSituation({ lat: hit.lat, lng: hit.lng });
      setGeocodeState("idle");
    } catch {
      setGeocodeState("error");
    }
  };

  return (
    <section className="ic-situation">
      <header className="ic-situation-hero">
        <div className="ic-situation-hero__main">
          <p className="ic-situation-hero__eyebrow">ICS · Command</p>
          <h2 className="ic-situation-hero__title">Situation</h2>
          <p className="ic-situation-hero__sub">
            The incident&apos;s master record — its stage, identity, location, and command picture,
            all in one place.
          </p>
          <span
            className={`ic-situation-status ic-situation-status--${situation.activationLevel}`}
          >
            {activeLevel.label}
          </span>
        </div>
        <nav className="ic-activation-bar" aria-label="Activation level">
          {ACTIVATION_LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              className={`ic-activation-bar__btn ic-activation-bar__btn--${l.value}${
                situation.activationLevel === l.value ? " ic-activation-bar__active" : ""
              }`}
              onClick={() => setActivationLevel(l.value)}
              aria-pressed={situation.activationLevel === l.value}
              title={l.hint}
            >
              <span className="ic-activation-bar__label">{l.label}</span>
              <span className="ic-activation-bar__hint">{l.hint}</span>
            </button>
          ))}
        </nav>
      </header>

      <p className="ic-situation-purpose">
        <span className="ic-situation-purpose__icon" aria-hidden><IconInfo size={17} /></span>
        <span>
          <strong>This is the single source of truth for the incident.</strong> What you set here
          flows into the dashboard, ICS‑201, briefings, the weather &amp; load‑shedding lookups, and
          the map pin. Set the <strong>stage</strong> above as the response evolves, and keep the
          summary current so everyone sees the same picture.
        </span>
      </p>

      <div className="ic-situation__body">
        <form className="ic-situation__grid" onSubmit={(e) => e.preventDefault()}>
          <article className="ic-situation-card ic-situation-card--identity">
            <header className="ic-situation-card__head">
              <span className="ic-situation-card__icon" aria-hidden>
                <IconList />
              </span>
              <div>
                <h3 className="ic-situation-card__title">Event identity</h3>
                <p className="ic-situation-card__desc">
                  Name &amp; timeframe — shown on every screen, form, and PDF
                </p>
              </div>
            </header>
            <div className="ic-situation-card__fields">
              <label className="ic-field ic-field--full">
                <span>Incident name</span>
                <input
                  type="text"
                  value={situation.name}
                  onChange={(e) => updateSituation({ name: e.target.value })}
                />
              </label>
              <label className="ic-field">
                <span>Start date</span>
                <input
                  type="datetime-local"
                  value={situation.startDate}
                  onChange={(e) => updateSituation({ startDate: e.target.value })}
                />
              </label>
              <label className="ic-field">
                <span>End date</span>
                <input
                  type="datetime-local"
                  value={situation.endDate}
                  onChange={(e) => updateSituation({ endDate: e.target.value })}
                />
              </label>
            </div>
          </article>

          <article className="ic-situation-card ic-situation-card--location">
            <header className="ic-situation-card__head">
              <span className="ic-situation-card__icon ic-situation-card__icon--map" aria-hidden>
                <IconMap />
              </span>
              <div>
                <h3 className="ic-situation-card__title">Location</h3>
                <p className="ic-situation-card__desc">
                  Sets the map pin, weather, and load‑shedding area
                </p>
              </div>
            </header>
            <div className="ic-situation-card__fields">
              <label className="ic-field ic-field--full">
                <span>Location</span>
                <div className="ic-situation-locate">
                  <input
                    type="text"
                    placeholder="Address or place name"
                    value={situation.location}
                    onChange={(e) => updateSituation({ location: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void geocodeLocation();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="ic-btn-secondary ic-btn-secondary--sm"
                    onClick={() => void geocodeLocation()}
                    disabled={geocodeState === "loading" || !situation.location.trim()}
                    title="Find coordinates for this place (enables weather + map)"
                  >
                    {geocodeState === "loading" ? "Locating…" : "Locate"}
                  </button>
                </div>
                {geocodeState === "none" ? (
                  <span className="ic-situation-locate__msg">
                    Couldn&apos;t find that place — try a more specific name or enter the coordinates
                    below.
                  </span>
                ) : geocodeState === "error" ? (
                  <span className="ic-situation-locate__msg">
                    Location lookup failed — check the connection or enter coordinates below.
                  </span>
                ) : null}
              </label>
              <label className="ic-field">
                <span>Latitude</span>
                <input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  placeholder="e.g. -25.7479"
                  value={situation.lat ?? ""}
                  onChange={(e) => updateSituation({ lat: parseCoord(e.target.value, 90) })}
                />
              </label>
              <label className="ic-field">
                <span>Longitude</span>
                <input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  placeholder="e.g. 28.2293"
                  value={situation.lng ?? ""}
                  onChange={(e) => updateSituation({ lng: parseCoord(e.target.value, 180) })}
                />
              </label>
              <div className="ic-situation-card__footer">
                {hasCoords ? (
                  <p className="ic-situation-coords">
                    Map pin: {situation.lat!.toFixed(5)}, {situation.lng!.toFixed(5)}
                  </p>
                ) : (
                  <p className="ic-situation-coords ic-situation-coords--empty">
                    No map coordinates yet
                  </p>
                )}
                <Link href={moduleHref(eventId, "map")} className="ic-situation-map-link">
                  Set on map →
                </Link>
              </div>
            </div>
          </article>

          <article className="ic-situation-card ic-situation-card--narrative">
            <header className="ic-situation-card__head">
              <span className="ic-situation-card__icon ic-situation-card__icon--narrative" aria-hidden>
                <IconCalendar />
              </span>
              <div>
                <h3 className="ic-situation-card__title">Operational picture</h3>
                <p className="ic-situation-card__desc">
                  Summary, objectives &amp; contacts — populates ICS‑201 and briefings
                </p>
              </div>
            </header>
            <div className="ic-situation-card__fields ic-situation-card__fields--stack">
              <label className="ic-field ic-field--full">
                <span>Situation summary</span>
                <textarea
                  rows={5}
                  placeholder="Current conditions, impacts, and immediate concerns…"
                  value={situation.summary}
                  onChange={(e) => updateSituation({ summary: e.target.value })}
                />
              </label>
              <label className="ic-field ic-field--full">
                <span>Current and planned objectives</span>
                <textarea
                  rows={5}
                  placeholder="Operational objectives for this period…"
                  value={situation.objectives}
                  onChange={(e) => updateSituation({ objectives: e.target.value })}
                />
              </label>
              <label className="ic-field ic-field--full">
                <span>Key contacts</span>
                <textarea
                  rows={4}
                  placeholder="Name — role — phone / email"
                  value={situation.keyContacts ?? ""}
                  onChange={(e) => updateSituation({ keyContacts: e.target.value })}
                />
              </label>
            </div>
          </article>
        </form>
      </div>
    </section>
  );
}

export function RolesView({ searchActive, orgChartOpen }: ViewProps) {
  const roleGroups = useIncidentStore((s) => s.roleGroups);
  const personnel = useIncidentStore((s) => s.personnel);
  const addRole = useIncidentStore((s) => s.addRole);
  const updateRole = useIncidentStore((s) => s.updateRole);
  const removeRole = useIncidentStore((s) => s.removeRole);
  const assignPersonnelToRole = useIncidentStore((s) => s.assignPersonnelToRole);
  const [roleQuery, setRoleQuery] = useState("");

  // Deployment gating: flag when the person assigned to a role isn't fit to deploy.
  const shifts = useIncidentStore((s) => s.shifts);
  const certifications = useIncidentStore((s) => s.certifications);
  const fieldUnits = useIncidentStore((s) => s.fieldUnits);
  const settings = useIncidentStore((s) => s.settings);
  const now = useNow(60000);
  const roleReadiness = (personnelId: string | null) =>
    personnelId
      ? personReadiness(
          personnelId,
          { shifts, certifications, roleGroups, fieldUnits },
          {
            maxShiftHours: settings.maxShiftHours ?? 12,
            maxOnDuty24h: settings.maxOnDuty24h ?? 16,
            minRestHours: settings.minRestHours ?? 8,
          },
          settings.certReminderDays ?? 30,
          now,
        )
      : null;

  const personnelOptions = [
    { value: "", label: "— Unassigned —" },
    ...personnel.map((p) => ({ value: p.id, label: p.name || "Unnamed" })),
  ];

  const personnelById = useMemo(
    () => new Map(personnel.map((p) => [p.id, p.name || "Unnamed"])),
    [personnel],
  );

  const q = roleQuery.trim().toLowerCase();
  const filterRole = (title: string) => !searchActive || !q || title.toLowerCase().includes(q);

  return (
    <section>
      {orgChartOpen ? (
        <section className="ic-org-chart" aria-label="Organization chart">
          <h2 className="ic-org-chart__title">Organization chart</h2>
          <div className="ic-org-chart__grid">
            {roleGroups.map((group) => (
              <article key={group.id} className="ic-org-chart__group">
                <h3>{group.name}</h3>
                <ul>
                  {group.roles.map((role) => (
                    <li key={role.id}>
                      <strong>{role.title || "Untitled role"}</strong>
                      <span>
                        {role.personnelId
                          ? personnelById.get(role.personnelId) ?? "Assigned"
                          : "Vacant"}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <SearchBar active={searchActive} query={roleQuery} onQuery={setRoleQuery} />
      <table className="ic-table ic-table--roles">
        <thead>
          <tr>
            <th>Role</th>
            <th>Personnel</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {roleGroups.map((group) => {
            const visibleRoles = group.roles.filter((r) => filterRole(r.title));
            if (searchActive && q && visibleRoles.length === 0) return null;
            return (
              <Fragment key={group.id}>
                <tr className="ic-roles-group">
                  <td colSpan={3}>
                    <strong>{group.name}</strong>
                    <button
                      type="button"
                      className="ic-link-btn"
                      onClick={() => addRole(group.id)}
                    >
                      + Add Role
                    </button>
                  </td>
                </tr>
                {visibleRoles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <InlineInput
                        value={role.title}
                        onChange={(v) => updateRole(group.id, role.id, { title: v })}
                      />
                    </td>
                    <td>
                      <InlineSelect
                        value={role.personnelId ?? ""}
                        onChange={(v) =>
                          assignPersonnelToRole(group.id, role.id, v || null)
                        }
                        options={personnelOptions}
                      />
                      {(() => {
                        const r = roleReadiness(role.personnelId);
                        if (!r || r.level === "ready") return null;
                        return (
                          <span
                            className={`ic-role-flag ic-role-flag--${r.level}`}
                            title={r.issues.join(" · ")}
                          >
                            <IconAlertTriangle size={12} /> {r.issues[0]}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <RowDelete onClick={() => removeRole(group.id, role.id)} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

type ActivityFilter = "all" | "ui" | "data" | "navigation" | "user" | "audit";

type TimelineRow =
  | { id: string; sortAt: string; source: "log"; entry: LogEntry }
  | { id: string; sortAt: string; source: "audit"; entry: AuditEntry };

export function LogsView() {
  const logs = useIncidentStore((s) => s.logs);
  const audit = useIncidentStore((s) => s.audit);
  const addLog = useIncidentStore((s) => s.addLog);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [message, setMessage] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const timeline = useMemo(() => {
    const rows: TimelineRow[] = [
      ...logs.map((entry) => ({
        id: `log-${entry.id}`,
        sortAt: entry.createdAt,
        source: "log" as const,
        entry,
      })),
      ...audit.map((entry) => ({
        id: `audit-${entry.id}`,
        sortAt: entry.createdAt,
        source: "audit" as const,
        entry,
      })),
    ];
    rows.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
    return rows;
  }, [logs, audit]);

  const filtered = useMemo(() => {
    if (filter === "all") return timeline;
    if (filter === "audit") return timeline.filter((r) => r.source === "audit");
    if (filter === "user") {
      return timeline.filter(
        (r) => r.source === "log" && (r.entry.kind === "user" || r.entry.tags.includes("user")),
      );
    }
    return timeline.filter(
      (r) => r.source === "log" && (r.entry.kind === filter || r.entry.tags.includes(filter)),
    );
  }, [timeline, filter]);

  const submit = () => {
    if (!message.trim()) return;
    addLog(message, tags);
    setMessage("");
    setTags([]);
    setTagInput("");
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  };

  return (
    <section className="ic-logs">
      <header className="ic-logs__header ic-logs__header--compact">
        <span className="ic-logs__count">{timeline.length} events</span>
      </header>

      <nav className="ic-logs__filters" aria-label="Filter activity">
        {(
          [
            ["all", "All"],
            ["ui", "UI"],
            ["data", "Data"],
            ["navigation", "Navigation"],
            ["user", "Manual"],
            ["audit", "Audit"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={filter === id ? "ic-logs__filter ic-logs__filter--active" : "ic-logs__filter"}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p className="ic-empty-hint ic-logs__empty">There are no events to display.</p>
      ) : (
        <ul className="ic-log-list ic-log-list--activity">
          {filtered.map((row) =>
            row.source === "log" ? (
              <li
                key={row.id}
                className={`ic-log-list__item ic-log-list__item--${row.entry.kind ?? "system"}`}
              >
                <time>{formatDate(row.entry.createdAt)}</time>
                <div className="ic-log-list__body">
                  <p className="ic-log-list__line">
                    <strong>{row.entry.author}</strong> {row.entry.message}
                    {row.entry.target ? (
                      <span className="ic-log-list__target"> → {row.entry.target}</span>
                    ) : null}
                  </p>
                  {row.entry.detail ? (
                    <p className="ic-log-list__detail">{row.entry.detail}</p>
                  ) : null}
                  {row.entry.tags?.length ? (
                    <span className="ic-log-tags">
                      {row.entry.tags.map((t) => (
                        <span key={t} className="ic-log-tag">
                          {t}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
              </li>
            ) : (
              <li key={row.id} className="ic-log-list__item ic-log-list__item--audit">
                <time>{formatDate(row.entry.createdAt)}</time>
                <div className="ic-log-list__body">
                  <p className="ic-log-list__line">
                    <strong>{row.entry.actor}</strong> {row.entry.action}
                  </p>
                  <span className="ic-log-tags">
                    <span className="ic-log-tag">audit</span>
                  </span>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <footer className="ic-log-composer">
        {tags.length > 0 ? (
          <div className="ic-log-composer__tags">
            {tags.map((t) => (
              <span key={t} className="ic-log-tag">
                {t}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <input
          type="text"
          placeholder="Add a manual log entry…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
        />
        <input
          type="text"
          className="ic-log-composer__tag-input"
          placeholder="Tag"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
        />
        <button type="button" className="ic-link-btn" onClick={addTag}>
          + Tag
        </button>
        <button type="button" aria-label="Send" onClick={submit}>
          →
        </button>
      </footer>
    </section>
  );
}

const TASK_STATUS_OPTS: { value: TaskItemStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "canceled", label: "Canceled" },
];

export { TasksEnhancedView as TasksView } from "./d4h/TasksEnhancedView";

const DAMAGE_STATUS: { value: DamageStatus; label: string }[] = [
  { value: "assessing", label: "Assessing" },
  { value: "minor", label: "Minor" },
  { value: "severe", label: "Severe" },
];

export function DamageAssessmentView({ searchActive, filterActive }: ViewProps) {
  const damages = useIncidentStore((s) => s.damages);
  const updateDamage = useIncidentStore((s) => s.updateDamage);
  const removeDamage = useIncidentStore((s) => s.removeDamage);
  const [statusFilter, setStatusFilter] = useState("");
  const statusScoped = useMemo(
    () => filterByStatus(damages, filterActive, statusFilter, (d) => d.status),
    [damages, filterActive, statusFilter],
  );
  const { query, setQuery, filtered } = useSearchFilter(statusScoped, (d, q) =>
    d.name.toLowerCase().includes(q),
  );
  const minor = damages.filter((d) => d.status === "minor").length;
  const totalCost = damages.reduce((s, d) => s + d.estimatedCost, 0);

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <StatusFilterBar
        active={filterActive}
        label="Damage status"
        value={statusFilter}
        onChange={setStatusFilter}
        options={[{ value: "", label: "All statuses" }, ...DAMAGE_STATUS]}
      />
      <SummaryBar left={`Minor Damage: ${minor}`} right={`Total Cost: $${totalCost}`} />
      <section className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Damage Description</th>
              <th>Estimated Cost</th>
              <th>Status</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td>
                  <InlineInput
                    value={d.name}
                    onChange={(v) => updateDamage(d.id, { name: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    value={d.description}
                    onChange={(v) => updateDamage(d.id, { description: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    value={d.estimatedCost}
                    onChange={(v) =>
                      updateDamage(d.id, { estimatedCost: Number(v) || 0 })
                    }
                  />
                </td>
                <td>
                  <InlineSelect
                    value={d.status}
                    onChange={(v) =>
                      updateDamage(d.id, { status: v as DamageStatus })
                    }
                    options={DAMAGE_STATUS}
                  />
                </td>
                <td>
                  <CoordCell lat={d.lat} lng={d.lng} onChange={(patch) => updateDamage(d.id, patch)} />
                </td>
                <td>
                  <RowDelete onClick={() => removeDamage(d.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No damage records.</p> : null}
      </section>
    </section>
  );
}

export function ResidentsView({ searchActive }: ViewProps) {
  const areas = useIncidentStore((s) => s.residentAreas);
  const residents = useIncidentStore((s) => s.residents);
  const shelters = useIncidentStore((s) => s.shelters);
  const situation = useIncidentStore((s) => s.situation);
  const updateArea = useIncidentStore((s) => s.updateResidentArea);
  const removeArea = useIncidentStore((s) => s.removeResidentArea);
  const addResident = useIncidentStore((s) => s.addResident);
  const updateResident = useIncidentStore((s) => s.updateResident);
  const removeResident = useIncidentStore((s) => s.removeResident);
  const [sortMode, setSortMode] = useState<ResidentAreaSortMode>("city_asc");
  const prevAreaCountRef = useRef(areas.length);

  useEffect(() => {
    for (const a of areas) {
      if (a.city.trim() && !a.censusPlaceId) {
        const patch = tryAutofillResidentAreaFromCity(a.city);
        if (patch) updateArea(a.id, patch);
      }
    }
  }, [areas, updateArea]);

  useEffect(() => {
    if (areas.length <= prevAreaCountRef.current) {
      prevAreaCountRef.current = areas.length;
      return;
    }
    prevAreaCountRef.current = areas.length;
    const newest = areas[areas.length - 1];
    if (!newest || newest.censusPlaceId) return;

    async function prefillFromIncident(area: ResidentArea) {
      if (situation.lat != null && situation.lng != null) {
        try {
          const res = await fetch(
            `/api/map/reverse-geocode?lat=${situation.lat}&lng=${situation.lng}`,
          );
          const data = (await res.json()) as { city?: string | null };
          if (data.city) {
            const patch = tryAutofillResidentAreaFromCity(data.city);
            if (patch) {
              updateArea(area.id, patch);
              return;
            }
            updateArea(area.id, { city: data.city });
            return;
          }
        } catch {
          /* fall through */
        }
      }
      if (situation.name.trim()) {
        const patch = tryAutofillResidentAreaFromCity(situation.name);
        if (patch) updateArea(area.id, patch);
      }
    }

    void prefillFromIncident(newest);
  }, [areas.length, areas, situation.lat, situation.lng, situation.name, updateArea]);

  const { query, setQuery, filtered: searched } = useSearchFilter(areas, (a, q) => {
    const blob = `${a.city} ${a.municipality} ${a.province}`.toLowerCase();
    return blob.includes(q);
  });
  const filtered = useMemo(
    () => sortResidentAreas(searched, sortMode),
    [searched, sortMode],
  );

  const censusTotal = areas.reduce((s, a) => s + a.censusPopulation, 0);
  const affectedTotal = areas.reduce((s, a) => s + a.estimatedAffected, 0);

  const shelterOpts = [
    { value: "", label: "—" },
    ...shelters.map((s) => ({ value: s.id, label: s.name })),
  ];
  const areaOpts = [
    { value: "", label: "—" },
    ...areas.map((a) => ({
      value: a.id,
      label: a.city || a.municipality || "Area",
    })),
  ];

  const { query: indQuery, setQuery: setIndQuery, filtered: filteredIndividuals } =
    useSearchFilter(residents, (r, q) => r.name.toLowerCase().includes(q));

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <div className="ic-utilities-toolbar">
        <SortBar
          label="Sort by"
          value={sortMode}
          onChange={(v) => setSortMode(v as ResidentAreaSortMode)}
          options={[
            { value: "city_asc", label: "City (A–Z)" },
            { value: "city_desc", label: "City (Z–A)" },
            { value: "census_desc", label: "Census population (high–low)" },
            { value: "affected_desc", label: "Est. affected (high–low)" },
            { value: "tracked_desc", label: "Shelter registrations (high–low)" },
          ]}
        />
      </div>
      <SummaryBar
        left={`Census ${CENSUS_YEAR} total (listed areas): ${censusTotal > 0 ? formatPopulation(censusTotal) : "—"}`}
        right={`Est. affected: ${affectedTotal > 0 ? formatPopulation(affectedTotal) : "—"}`}
      />
      <p className="ic-route-field__hint ic-residents-source">
        Population estimates: {CENSUS_SOURCE}. City, province, and census population auto-fill when you
        type a name or add a new row (uses incident map location when set).
      </p>

      <section className="ic-table-wrap ic-table-wrap--scroll">
        <table className="ic-table">
          <thead>
            <tr>
              <th>City / area</th>
              <th>Province</th>
              <th>Census pop. ({CENSUS_YEAR})</th>
              <th>Est. affected</th>
              <th>Registered</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td className="ic-residents-city-cell">
                  <CensusCityField
                    label=""
                    city={a.city}
                    censusPlaceId={a.censusPlaceId}
                    municipality={a.municipality}
                    onCityChange={(v) => updateArea(a.id, { city: v })}
                    onCensusClear={() =>
                      updateArea(a.id, {
                        censusPlaceId: null,
                        censusPopulation: 0,
                        municipality: "",
                        province: "",
                      })
                    }
                    onPlaceSelect={(place) =>
                      updateArea(a.id, residentAreaPatchFromCensus(place))
                    }
                  />
                </td>
                <td>
                  {a.censusPlaceId ? (
                    <span className="ic-census-readonly">{a.province || "—"}</span>
                  ) : (
                    <InlineInput
                      value={a.province}
                      onChange={(v) => updateArea(a.id, { province: v })}
                      placeholder="Auto-fills from city"
                    />
                  )}
                </td>
                <td className="ic-residents-census">
                  {a.censusPopulation > 0 ? (
                    <>
                      {formatPopulation(a.censusPopulation)}
                      <span className="ic-census-readonly__tag">Census {CENSUS_YEAR}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    value={a.estimatedAffected}
                    onChange={(v) =>
                      updateArea(a.id, { estimatedAffected: Number(v) || 0 })
                    }
                  />
                </td>
                <td>
                  {residents.filter((r) => r.residentAreaId === a.id).length}
                </td>
                <td>
                  <InlineInput
                    value={a.notes}
                    onChange={(v) => updateArea(a.id, { notes: v })}
                  />
                </td>
                <td>
                  <RowDelete onClick={() => removeArea(a.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="ic-table-empty">No city rows. Use Add to create an area.</p>
        ) : null}
      </section>

      <h3 className="ic-page-subheading">Shelter registrations</h3>
      <p className="ic-route-field__hint">
        Individual people registered at shelters (optional). Link to a city area above.
      </p>
      <SearchBar active={searchActive} query={indQuery} onQuery={setIndQuery} />
      <div className="ic-map-navbar__btn-row">
        <button type="button" className="ic-map-navbar__btn ic-map-navbar__btn--secondary" onClick={addResident}>
          Add registration
        </button>
      </div>
      <section className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>City area</th>
              <th>Shelter</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredIndividuals.map((r) => (
              <tr key={r.id}>
                <td>
                  <InlineInput
                    value={r.name}
                    onChange={(v) => updateResident(r.id, { name: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    value={r.phone}
                    onChange={(v) => updateResident(r.id, { phone: v })}
                  />
                </td>
                <td>
                  <InlineSelect
                    value={r.residentAreaId ?? ""}
                    onChange={(v) =>
                      updateResident(r.id, { residentAreaId: v || null })
                    }
                    options={areaOpts}
                  />
                </td>
                <td>
                  <InlineSelect
                    value={r.shelterId ?? ""}
                    onChange={(v) =>
                      updateResident(r.id, { shelterId: v || null })
                    }
                    options={shelterOpts}
                  />
                </td>
                <td>
                  <RowDelete onClick={() => removeResident(r.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredIndividuals.length === 0 ? (
          <p className="ic-table-empty">No shelter registrations.</p>
        ) : null}
      </section>
    </section>
  );
}

const RR_STATUS: { value: ResourceRequestStatus; label: string }[] = [
  { value: "requested", label: "Requested" },
  { value: "enroute", label: "Enroute" },
  { value: "assigned", label: "Assigned" },
  { value: "ready", label: "Ready" },
];

export function ResourceRequestsView({ searchActive, filterActive }: ViewProps) {
  const rows = useIncidentStore((s) => s.resourceRequests);
  const update = useIncidentStore((s) => s.updateResourceRequest);
  const remove = useIncidentStore((s) => s.removeResourceRequest);
  const [statusFilter, setStatusFilter] = useState("");
  const statusScoped = useMemo(
    () => filterByStatus(rows, filterActive, statusFilter, (r) => r.status),
    [rows, filterActive, statusFilter],
  );
  const { query, setQuery, filtered } = useSearchFilter(statusScoped, (r, q) =>
    r.resource.toLowerCase().includes(q),
  );
  const counts = {
    requested: rows.filter((r) => r.status === "requested").length,
    enroute: rows.filter((r) => r.status === "enroute").length,
    assigned: rows.filter((r) => r.status === "assigned").length,
    ready: rows.filter((r) => r.status === "ready").length,
  };

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <StatusFilterBar
        active={filterActive}
        label="Request status"
        value={statusFilter}
        onChange={setStatusFilter}
        options={[{ value: "", label: "All statuses" }, ...RR_STATUS]}
      />
      <StatusBar
        items={[
          { label: "Requested", count: counts.requested },
          { label: "Enroute", count: counts.enroute },
          { label: "Assigned", count: counts.assigned },
          { label: "Ready", count: counts.ready },
        ]}
      />
      <section className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Status</th>
              <th>Cost Per Hour</th>
              <th>Hours</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <InlineInput
                    value={r.resource}
                    onChange={(v) => update(r.id, { resource: v })}
                  />
                </td>
                <td>
                  <InlineSelect
                    value={r.status}
                    onChange={(v) => update(r.id, { status: v as ResourceRequestStatus })}
                    options={RR_STATUS}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    value={r.costPerHour}
                    onChange={(v) => update(r.id, { costPerHour: Number(v) || 0 })}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    value={r.hours}
                    onChange={(v) => update(r.id, { hours: Number(v) || 0 })}
                  />
                </td>
                <td>
                  <CoordCell lat={r.lat} lng={r.lng} onChange={(patch) => update(r.id, patch)} />
                </td>
                <td>
                  <RowDelete onClick={() => remove(r.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No resource requests.</p> : null}
      </section>
    </section>
  );
}

const ROAD_STATUS: { value: RoadStatus; label: string }[] = [
  { value: "closed", label: "Closed" },
  { value: "one_lane", label: "One lane" },
  { value: "open", label: "Open" },
];

export function RoadDamagesView({ searchActive, filterActive }: ViewProps) {
  const rows = useIncidentStore((s) => s.roadDamages);
  const update = useIncidentStore((s) => s.updateRoadDamage);
  const remove = useIncidentStore((s) => s.removeRoadDamage);
  const [statusFilter, setStatusFilter] = useState("");
  const statusScoped = useMemo(
    () => filterByStatus(rows, filterActive, statusFilter, (r) => r.status),
    [rows, filterActive, statusFilter],
  );
  const { query, setQuery, filtered } = useSearchFilter(statusScoped, (r, q) =>
    r.roadName.toLowerCase().includes(q),
  );

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <StatusFilterBar
        active={filterActive}
        label="Road status"
        value={statusFilter}
        onChange={setStatusFilter}
        options={[{ value: "", label: "All statuses" }, ...ROAD_STATUS]}
      />
      <StatusBar
        items={[
          { label: "Closed", count: rows.filter((r) => r.status === "closed").length },
          { label: "One lane", count: rows.filter((r) => r.status === "one_lane").length },
          { label: "Open", count: rows.filter((r) => r.status === "open").length },
        ]}
      />
      <section className="ic-table-wrap ic-table-wrap--scroll">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Road Name</th>
              <th>From</th>
              <th>To</th>
              <th>Status</th>
              <th>Municipality</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <InlineInput
                    value={r.roadName}
                    onChange={(v) => update(r.id, { roadName: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    value={r.fromIntersection}
                    onChange={(v) => update(r.id, { fromIntersection: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    value={r.toIntersection}
                    onChange={(v) => update(r.id, { toIntersection: v })}
                  />
                </td>
                <td>
                  <InlineSelect
                    value={r.status}
                    onChange={(v) => update(r.id, { status: v as RoadStatus })}
                    options={ROAD_STATUS}
                  />
                </td>
                <td>
                  <InlineInput
                    value={r.municipality}
                    onChange={(v) => update(r.id, { municipality: v })}
                  />
                </td>
                <td>
                  <CoordCell lat={r.lat} lng={r.lng} onChange={(patch) => update(r.id, patch)} />
                </td>
                <td>
                  <RowDelete onClick={() => remove(r.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No road damages.</p> : null}
      </section>
    </section>
  );
}

const SHELTER_STATUS: { value: ShelterStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "full", label: "Full" },
  { value: "closed", label: "Closed" },
];

export function SheltersView({ searchActive, filterActive }: ViewProps) {
  const shelters = useIncidentStore((s) => s.shelters);
  const update = useIncidentStore((s) => s.updateShelter);
  const remove = useIncidentStore((s) => s.removeShelter);
  const [statusFilter, setStatusFilter] = useState("");
  const statusScoped = useMemo(
    () => filterByStatus(shelters, filterActive, statusFilter, (s) => s.status),
    [shelters, filterActive, statusFilter],
  );
  const { query, setQuery, filtered } = useSearchFilter(statusScoped, (s, q) =>
    s.name.toLowerCase().includes(q),
  );
  const occupancy = shelters.reduce((sum, s) => sum + s.occupancy, 0);

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <StatusFilterBar
        active={filterActive}
        label="Shelter status"
        value={statusFilter}
        onChange={setStatusFilter}
        options={[{ value: "", label: "All statuses" }, ...SHELTER_STATUS]}
      />
      <SummaryBar left={`Total occupancy: ${occupancy}`} />
      <section className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Capacity</th>
              <th>Occupancy</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>
                  <InlineInput value={s.name} onChange={(v) => update(s.id, { name: v })} />
                </td>
                <td>
                  <InlineSelect
                    value={s.status}
                    onChange={(v) => update(s.id, { status: v as ShelterStatus })}
                    options={SHELTER_STATUS}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    value={s.capacity}
                    onChange={(v) => update(s.id, { capacity: Number(v) || 0 })}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    max={s.capacity > 0 ? s.capacity : undefined}
                    value={s.occupancy}
                    onChange={(v) => update(s.id, { occupancy: Number(v) || 0 })}
                  />
                </td>
                <td>
                  <CoordCell lat={s.lat} lng={s.lng} onChange={(patch) => update(s.id, patch)} />
                </td>
                <td>
                  <RowDelete onClick={() => remove(s.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No shelters.</p> : null}
      </section>
    </section>
  );
}

export function UtilitiesView({ searchActive }: ViewProps) {
  const rows = useIncidentStore((s) => s.utilities);
  const update = useIncidentStore((s) => s.updateUtilityRow);
  const remove = useIncidentStore((s) => s.removeUtilityRow);
  const [sortMode, setSortMode] = useState<UtilitySortMode>("city_asc");
  const { query, setQuery, filtered: searched } = useSearchFilter(rows, (u, q) => {
    const city = (u.city || u.municipality).toLowerCase();
    return (
      city.includes(q) ||
      u.municipality.toLowerCase().includes(q) ||
      u.hazardRegion.toLowerCase().includes(q)
    );
  });
  const filtered = useMemo(
    () => sortUtilityRows(searched, sortMode),
    [searched, sortMode],
  );
  const impacted = rows.reduce((s, u) => s + u.customersWithoutPower, 0);
  const total = rows.reduce((s, u) => s + u.totalCustomers, 0);

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <div className="ic-utilities-toolbar">
        <SortBar
          label="Sort by"
          value={sortMode}
          onChange={(v) => setSortMode(v as UtilitySortMode)}
          options={[
            { value: "city_asc", label: "City (A–Z)" },
            { value: "city_desc", label: "City (Z–A)" },
            { value: "impacted_desc", label: "Most without power" },
            { value: "municipality_asc", label: "Municipality (A–Z)" },
          ]}
        />
      </div>
      <SummaryBar
        left={`Total Customers in service area: ${total || "—"}`}
        right={`Total Electricity Customers Impacted: ${impacted}`}
      />
      <section className="ic-table-wrap ic-table-wrap--scroll">
        <table className="ic-table">
          <thead>
            <tr>
              <th>City</th>
              <th>Municipality</th>
              <th>Region</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Without Power</th>
              <th>Total Customers</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <InlineInput
                    value={u.city ?? ""}
                    onChange={(v) => update(u.id, { city: v })}
                    placeholder="e.g. Durban"
                  />
                </td>
                <td>
                  <InlineInput
                    value={u.municipality}
                    onChange={(v) => update(u.id, { municipality: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    value={u.hazardRegion}
                    onChange={(v) => update(u.id, { hazardRegion: v })}
                  />
                </td>
                <td>
                  <InlineInput value={u.tier} onChange={(v) => update(u.id, { tier: v })} />
                </td>
                <td>
                  <InlineInput
                    value={u.status}
                    onChange={(v) => update(u.id, { status: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    max={u.totalCustomers > 0 ? u.totalCustomers : undefined}
                    value={u.customersWithoutPower}
                    onChange={(v) =>
                      update(u.id, { customersWithoutPower: Number(v) || 0 })
                    }
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    min={0}
                    value={u.totalCustomers}
                    onChange={(v) => update(u.id, { totalCustomers: Number(v) || 0 })}
                  />
                </td>
                <td>
                  <RowDelete onClick={() => remove(u.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No utility rows.</p> : null}
      </section>
    </section>
  );
}

export function PersonnelView({ searchActive }: ViewProps) {
  const personnel = useIncidentStore((s) => s.personnel);
  const addPersonnel = useIncidentStore((s) => s.addPersonnel);
  const update = useIncidentStore((s) => s.updatePersonnel);
  const remove = useIncidentStore((s) => s.removePersonnel);
  const roster = useOrgRoster((s) => s.people);
  // Cross-module readiness: fuse each person's fatigue (shifts), certifications, and
  // assignment (role / field unit) into one status so Personnel is the unified person view.
  const shifts = useIncidentStore((s) => s.shifts);
  const certifications = useIncidentStore((s) => s.certifications);
  const roleGroups = useIncidentStore((s) => s.roleGroups);
  const fieldUnits = useIncidentStore((s) => s.fieldUnits);
  const settings = useIncidentStore((s) => s.settings);
  const now = useNow(60000);
  const readinessData: ReadinessData = { shifts, certifications, roleGroups, fieldUnits };
  const rules = {
    maxShiftHours: settings.maxShiftHours ?? 12,
    maxOnDuty24h: settings.maxOnDuty24h ?? 16,
    minRestHours: settings.minRestHours ?? 8,
  };
  const readinessOf = (id: string) =>
    personReadiness(id, readinessData, rules, settings.certReminderDays ?? 30, now);
  const [dropOver, setDropOver] = useState(false);
  const { query, setQuery, filtered } = useSearchFilter(personnel, (p, q) =>
    p.name.toLowerCase().includes(q),
  );

  const onRoster = (name: string) =>
    personnel.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addFromRoster = (person: { name: string; role: string }) => {
    if (!person.name.trim() || onRoster(person.name)) return;
    addPersonnel({ name: person.name, role: person.role });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data && typeof data.name === "string") addFromRoster(data);
    } catch {
      /* not a roster drag */
    }
  };

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />

      {roster.length > 0 ? (
        <div className="ic-roster-drop">
          <p className="ic-roster-drop__label">
            Drag people from your <Link href="/roster">roster</Link> onto the table below — or tap +
            to add.
          </p>
          <ul className="ic-roster-chips">
            {roster.map((person) => {
              const added = onRoster(person.name);
              return (
                <li
                  key={person.id}
                  className={`ic-roster-chip${added ? " ic-roster-chip--added" : ""}`}
                  draggable={!added}
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      "application/json",
                      JSON.stringify({ name: person.name, role: person.role }),
                    )
                  }
                >
                  <span className="ic-roster-chip__body">
                    <span className="ic-roster-chip__name">{person.name}</span>
                    {person.role ? (
                      <span className="ic-roster-chip__role">{person.role}</span>
                    ) : null}
                  </span>
                  {added ? (
                    <span className="ic-roster-chip__check" title="Already on this event">
                      ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ic-roster-chip__add"
                      onClick={() => addFromRoster(person)}
                      title="Add to event"
                    >
                      +
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="ic-empty-hint">
          Tip: build an org-wide <Link href="/roster">Personnel roster</Link> to reuse the same
          staff across incidents. For now, just add people to this incident directly below.
        </p>
      )}

      <section
        className={`ic-table-wrap ic-roster-dropzone${dropOver ? " ic-roster-dropzone--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDropOver(true);
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={handleDrop}
      >
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Readiness</th>
              <th>Online</th>
              <th>Location</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <InlineInput
                    value={p.name}
                    onChange={(v) => update(p.id, { name: v })}
                  />
                </td>
                <td>
                  <InlineInput
                    value={p.role}
                    onChange={(v) => update(p.id, { role: v })}
                  />
                </td>
                <td>
                  {(() => {
                    const r = readinessOf(p.id);
                    const assignment = r.role ?? (r.unitCallsign ? `Unit ${r.unitCallsign}` : null);
                    return (
                      <div className="ic-readiness">
                        <span
                          className={`ic-readiness__chip ic-readiness__chip--${r.level}`}
                          title={r.issues.join(" · ") || "Clear to deploy"}
                        >
                          {READY_LABEL[r.level]}
                        </span>
                        {r.issues.length > 0 ? (
                          <span className="ic-readiness__issues">{r.issues.join(" · ")}</span>
                        ) : assignment ? (
                          <span className="ic-readiness__meta">{r.onDuty ? "On duty · " : ""}{assignment}</span>
                        ) : r.onDuty ? (
                          <span className="ic-readiness__meta">On duty</span>
                        ) : null}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={p.online}
                    onChange={(e) => update(p.id, { online: e.target.checked })}
                  />
                </td>
                <td>
                  <CoordCell lat={p.lat} lng={p.lng} onChange={(patch) => update(p.id, patch)} />
                </td>
                <td>
                  <RowDelete onClick={() => remove(p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No personnel.</p> : null}
      </section>
    </section>
  );
}

function wxHourLabel(iso: string): string {
  // Local ISO from Open-Meteo: "2026-07-13T14:00"
  return iso.slice(11, 16) || iso;
}

function wxRelative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} h ago`;
}

/** Background tint for a value within a band range (transparent → warm). */
function wxHeat(value: number | null, min: number, max: number, hue: number): string {
  if (value == null) return "transparent";
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return `hsla(${hue}, 85%, 55%, ${(t * 0.55).toFixed(2)})`;
}

const WX_RISK_META: Record<
  WeatherRisk["kind"],
  { Icon: React.ComponentType<{ size?: number }>; cls: string }
> = {
  rain: { Icon: IconRain, cls: "ic-wx-risk--rain" },
  wind: { Icon: IconWind, cls: "ic-wx-risk--wind" },
  storm: { Icon: IconStorm, cls: "ic-wx-risk--storm" },
  visibility: { Icon: IconFog, cls: "ic-wx-risk--fog" },
};

function WeatherStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ic-wx-stat">
      <span className="ic-wx-stat__value">{value}</span>
      <span className="ic-wx-stat__label">{label}</span>
    </div>
  );
}

export function WeatherView() {
  const eventId = useEventId();
  const lat = useIncidentStore((s) => s.situation.lat);
  const lng = useIncidentStore((s) => s.situation.lng);
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (lat == null || lng == null) {
      setForecast(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // One retry after a short delay — the upstream provider can hiccup on a cold call.
    const attempt = (retriesLeft: number): Promise<void> =>
      fetch(`/api/weather/forecast?lat=${lat}&lng=${lng}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: WeatherForecast) => {
          if (!cancelled) setForecast(data);
        })
        .catch((err) => {
          if (cancelled) return;
          if (retriesLeft > 0) return new Promise<void>((res) => setTimeout(res, 1200)).then(() => attempt(retriesLeft - 1));
          const reason = err instanceof Error ? err.message : "network error";
          console.warn("[weather] forecast failed:", reason, `(lat=${lat}, lng=${lng})`);
          setError(`Unable to load the forecast (${reason}). Check the connection and retry.`);
        });
    attempt(1).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, reloadKey]);

  if (lat == null || lng == null) {
    return (
      <EmptyHint>
        Please{" "}
        <Link href={moduleHref(eventId, "situation")} className="ic-accent-link">
          set the location in Situation
        </Link>{" "}
        (latitude and longitude) first.
      </EmptyHint>
    );
  }

  const hours = forecast?.hours ?? [];
  const cur = forecast?.current;
  const peaks = forecast?.peaks;

  return (
    <section className="ic-wx">
      <header className="ic-wx-head">
        <div>
          <h2 className="ic-page-heading">Weather</h2>
          <p className="ic-wx-sub">
            Forecast for {lat.toFixed(4)}, {lng.toFixed(4)}
            {forecast ? (
              <>
                {" · "}
                {forecast.timezone} · updated {wxRelative(forecast.asOf)}
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="ic-btn-add ic-wx-refresh"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      {error ? <p className="ic-wx-error">{error}</p> : null}
      {loading && !forecast ? <p className="ic-empty-hint">Loading forecast…</p> : null}

      {forecast ? (
        <>
          {cur ? (
            <div className="ic-wx-current">
              <span className="ic-wx-current__icon" aria-hidden>
                <WeatherConditionIcon severity={cur.condition.severity} size={34} />
              </span>
              <div className="ic-wx-current__main">
                <span className="ic-wx-current__temp">
                  {cur.temperatureC != null ? `${Math.round(cur.temperatureC)}°C` : "—"}
                </span>
                <span className="ic-wx-current__label">{cur.condition.label}</span>
              </div>
              <dl className="ic-wx-current__meta">
                <div>
                  <dt>Feels like</dt>
                  <dd>{cur.apparentC != null ? `${Math.round(cur.apparentC)}°C` : "—"}</dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>
                    {cur.windMs != null ? `${cur.windMs.toFixed(1)} m/s` : "—"}{" "}
                    {windCompass(cur.windDir)}
                  </dd>
                </div>
                <div>
                  <dt>Gusts</dt>
                  <dd>{cur.windGustMs != null ? `${Math.round(cur.windGustMs)} m/s` : "—"}</dd>
                </div>
                <div>
                  <dt>Humidity</dt>
                  <dd>{cur.humidity != null ? `${Math.round(cur.humidity)}%` : "—"}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {forecast.risks.length > 0 ? (
            <div className="ic-wx-risks" role="list" aria-label="Weather risk flags">
              {forecast.risks.map((r, i) => {
                const meta = WX_RISK_META[r.kind];
                return (
                  <span key={`${r.kind}-${i}`} role="listitem" className={`ic-wx-risk ${meta.cls}`}>
                    <meta.Icon size={14} /> {r.label}
                    <strong> {r.window}</strong>
                    {r.peak ? <span className="ic-wx-risk__peak"> · peak {r.peak}</span> : null}
                  </span>
                );
              })}
            </div>
          ) : forecast.hours.length > 0 ? (
            <p className="ic-wx-clear">No significant weather hazards in the next {hours.length} hours.</p>
          ) : null}

          {peaks ? (
            <div className="ic-wx-stats">
              <WeatherStat
                label="Max temp"
                value={peaks.maxTempC != null ? `${Math.round(peaks.maxTempC)}°C` : "—"}
              />
              <WeatherStat
                label="Min temp"
                value={peaks.minTempC != null ? `${Math.round(peaks.minTempC)}°C` : "—"}
              />
              <WeatherStat
                label="Max gust"
                value={peaks.maxWindGustMs != null ? `${Math.round(peaks.maxWindGustMs)} m/s` : "—"}
              />
              <WeatherStat
                label="Precip (24h)"
                value={peaks.totalPrecipMm != null ? `${peaks.totalPrecipMm} mm` : "—"}
              />
              <WeatherStat
                label="Max rain prob"
                value={
                  peaks.maxPrecipProbability != null ? `${Math.round(peaks.maxPrecipProbability)}%` : "—"
                }
              />
            </div>
          ) : null}

          {hours.length > 0 ? (
            <div className="ic-wx-grid-wrap">
              <table className="ic-wx-grid">
                <tbody>
                  <tr className="ic-wx-grid__hours">
                    <th scope="row">Hour</th>
                    {hours.map((h) => (
                      <td key={h.time}>{wxHourLabel(h.time)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Summary</th>
                    {hours.map((h) => (
                      <td key={h.time} className="ic-wx-grid__icon" title={h.condition.label}>
                        <WeatherConditionIcon severity={h.condition.severity} size={18} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Temp °C</th>
                    {hours.map((h) => (
                      <td
                        key={h.time}
                        style={{ background: wxHeat(h.temperatureC, 0, 40, 30) }}
                      >
                        {h.temperatureC != null ? Math.round(h.temperatureC) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Rain %</th>
                    {hours.map((h) => (
                      <td key={h.time} style={{ background: wxHeat(h.precipProbability, 0, 100, 205) }}>
                        {h.precipProbability != null ? Math.round(h.precipProbability) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Rain mm/h</th>
                    {hours.map((h) => (
                      <td key={h.time} style={{ background: wxHeat(h.precipMm, 0, 8, 205) }}>
                        {h.precipMm != null ? h.precipMm.toFixed(1) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Wind m/s</th>
                    {hours.map((h) => (
                      <td key={h.time} style={{ background: wxHeat(h.windMs, 0, 20, 145) }}>
                        {h.windMs != null ? h.windMs.toFixed(1) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Gust m/s</th>
                    {hours.map((h) => (
                      <td key={h.time} style={{ background: wxHeat(h.windGustMs, 0, 25, 15) }}>
                        {h.windGustMs != null ? Math.round(h.windGustMs) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Wind dir</th>
                    {hours.map((h) => (
                      <td key={h.time} title={windCompass(h.windDir)}>
                        {h.windDir != null ? (
                          <span
                            className="ic-wx-arrow"
                            style={{ transform: `rotate(${h.windDir}deg)` }}
                            aria-hidden
                          >
                            ↓
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Vis km</th>
                    {hours.map((h) => (
                      <td key={h.time}>{h.visibilityKm != null ? h.visibilityKm : "—"}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="ic-wx-disclaimer">{forecast.disclaimer}</p>
        </>
      ) : null}
    </section>
  );
}

type ArchivedBlob = {
  id: string;
  name: string;
  kind: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  url: string;
};

const BLOB_KIND_LABEL: Record<string, string> = {
  ics_pdf: "ICS PDF",
  audit_txt: "Audit trail",
  incident_json: "Incident JSON",
  sitrep_txt: "SITREP",
  photo: "Photo",
  video: "Video",
  attachment: "Attachment",
};

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function LibraryView({ searchActive }: ViewProps) {
  const eventId = useEventId();
  const { data: session } = useSession();
  const [archived, setArchived] = useState<ArchivedBlob[]>([]);
  const [archiveState, setArchiveState] = useState<
    "idle" | "loading" | "ok" | "unauth" | "error"
  >("idle");

  // Read back the server-archived blobs. 401 (not signed in) is a clean, expected
  // state; a connection error means the DB isn't running.
  const loadArchived = useCallback(async () => {
    setArchiveState("loading");
    try {
      const res = await fetch(`/api/incidents/${eventId}/blobs`);
      if (res.status === 401) {
        setArchived([]);
        setArchiveState("unauth");
        return;
      }
      if (!res.ok) {
        setArchived([]);
        setArchiveState("error");
        return;
      }
      const data = (await res.json()) as { blobs: ArchivedBlob[] };
      setArchived(data.blobs ?? []);
      setArchiveState("ok");
    } catch {
      setArchived([]);
      setArchiveState("error");
    }
  }, [eventId]);

  useEffect(() => {
    void loadArchived();
  }, [loadArchived]);

  const library = useIncidentStore((s) => s.library);
  const forms = useIncidentStore((s) => s.forms);
  const customForms = useIncidentStore((s) => s.customForms);
  const audit = useIncidentStore((s) => s.audit);
  const report = useSituationReport();
  const incidentName = useIncidentStore((s) => s.situation.name);
  const update = useIncidentStore((s) => s.updateLibraryItem);
  const remove = useIncidentStore((s) => s.removeLibraryItem);
  const { query, setQuery, filtered } = useSearchFilter(library, (l, q) =>
    l.name.toLowerCase().includes(q),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportForm, setExportForm] = useState<IcsFormRecord | null>(null);
  const hiddenExportRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(false);

  const q = query.trim().toLowerCase();
  const visibleForms = q ? forms.filter((f) => f.name.toLowerCase().includes(q)) : forms;

  // Render the selected form into the hidden mount below (which lives inside this
  // module's React tree, so the FEMA layouts still get their incident-store context),
  // wait for it to commit, then snapshot it to PDF. `runningRef` guards against a
  // second overlapping run (React StrictMode re-invokes effects in dev); the result
  // is always applied — the component stays mounted throughout the export.
  useEffect(() => {
    if (!exportForm || runningRef.current) return;
    runningRef.current = true;

    const waitForLayout = () =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const check = () => {
          const node = hiddenExportRef.current?.querySelector<HTMLElement>(".fema-ics-form");
          if ((node && node.offsetHeight > 0) || performance.now() - start > 4000) {
            resolve();
            return;
          }
          setTimeout(check, 50);
        };
        setTimeout(check, 50);
      });

    (async () => {
      let message = "PDF export failed";
      try {
        await waitForLayout();
        const { exportIcsFormRecordToPdf } = await import("@/lib/incident/ics-form-pdf");
        const parsed = parseFormContent(exportForm.content, exportForm.templateId);
        const savedAt = exportForm.savedAt ?? new Date().toISOString();
        let archived = false;
        const archive = session
          ? async (blob: Blob, fname: string) => {
              const { uploadIncidentBlob } = await import("@/lib/storage/upload-client");
              const res = await uploadIncidentBlob(
                eventId,
                new File([blob], fname, { type: "application/pdf" }),
                "ics_pdf",
              );
              archived = res !== null;
            }
          : undefined;
        const filename = await exportIcsFormRecordToPdf(() => hiddenExportRef.current, {
          formNumber: exportForm.formNumber,
          formName: exportForm.name,
          savedAt,
          meta: parsed.meta ?? { savedAt, savedBy: exportForm.filledBy ?? "Operator" },
          legacyText: parsed.isStructured ? undefined : exportForm.content,
          archive,
        });
        message = `Downloaded ${filename}${archived ? " · archived to server" : ""}`;
      } catch (err) {
        message = err instanceof Error ? err.message : "PDF export failed";
      } finally {
        runningRef.current = false;
        setNotice(message);
        setBusyId(null);
        setExportForm(null);
      }
    })();
  }, [exportForm, session, eventId]);

  const handleFormPdf = (form: IcsFormRecord) => {
    if (busyId) return;
    setNotice(null);
    setBusyId(form.id);
    setExportForm(form);
  };

  const q2 = query.trim().toLowerCase();
  const visibleCustomForms = q2
    ? customForms.filter((f) => f.name.toLowerCase().includes(q2))
    : customForms;

  const handleCustomFormPdf = async (form: (typeof customForms)[number]) => {
    setNotice(null);
    try {
      const { customFormToPdf, triggerDownload } = await import("@/lib/incident/custom-form-export");
      const { filename, blob } = customFormToPdf(form);
      triggerDownload(blob, filename);
      let archived = false;
      if (session) {
        const { uploadIncidentBlob } = await import("@/lib/storage/upload-client");
        const res = await uploadIncidentBlob(
          eventId,
          new File([blob], filename, { type: "application/pdf" }),
          "ics_pdf",
        );
        archived = res !== null;
      }
      setNotice(`Downloaded ${filename}${archived ? " · archived to server" : ""}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleCustomFormJson = async (form: (typeof customForms)[number]) => {
    setNotice(null);
    try {
      const { downloadCustomFormJson } = await import("@/lib/incident/custom-form-export");
      const filename = downloadCustomFormJson(form);
      setNotice(`Downloaded ${filename}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleAuditTxt = async () => {
    setNotice(null);
    try {
      const { filename, blob } = downloadAuditTrailTxt(audit, incidentName);
      let archived = false;
      if (session) {
        const { uploadIncidentBlob } = await import("@/lib/storage/upload-client");
        const res = await uploadIncidentBlob(
          eventId,
          new File([blob], filename, { type: "text/plain" }),
          "audit_txt",
        );
        archived = res !== null;
      }
      setNotice(`Downloaded ${filename}${archived ? " · archived to server" : ""}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Export failed");
    }
  };

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      {notice ? (
        <p className="ic-form-editor__save-notice" role="status">
          {notice}
        </p>
      ) : null}

      <section className="ic-sitrep-cta">
        <div className="ic-sitrep-cta__text">
          <h3 className="ic-library__section-title">Situation report (PDF)</h3>
          <p className="ic-library__section-hint">
            One document capturing the whole picture — a map snapshot with your zones, current
            weather, the full operational status, personnel operating, and every form filled.
          </p>
        </div>
        <button
          type="button"
          className="ic-btn-add"
          disabled={report.busy}
          onClick={() =>
            report.run(session?.user?.name || session?.user?.email || "Operator")
          }
        >
          {report.busy ? "Generating…" : "Export situation report"}
        </button>
      </section>
      {report.notice ? (
        <p className="ic-form-editor__save-notice" role="status">
          {report.notice}
        </p>
      ) : null}

      <section className="ic-table-wrap">
        <h3 className="ic-library__section-title">Forms — PDF</h3>
        <p className="ic-library__section-hint">
          Every ICS form on this incident, downloadable as a letter-size PDF generated live from
          its current contents.
        </p>
        <table className="ic-table">
          <thead>
            <tr>
              <th>Form</th>
              <th>Status</th>
              <th>Last saved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleForms.map((f) => (
              <tr key={f.id}>
                <td>
                  <span className="ic-form-name">{f.name}</span>
                </td>
                <td>{f.status ?? "draft"}</td>
                <td>{formatDate(f.savedAt ?? f.modifiedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="ic-btn-secondary ic-btn-secondary--sm"
                    disabled={busyId === f.id}
                    onClick={() => handleFormPdf(f)}
                  >
                    {busyId === f.id ? "Generating…" : "PDF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleForms.length === 0 ? <p className="ic-table-empty">No forms yet.</p> : null}
      </section>

      <section className="ic-table-wrap">
        <h3 className="ic-library__section-title">Forms &amp; surveys</h3>
        <p className="ic-library__section-hint">
          Custom forms, surveys, and checklists built in the Forms section — export the design and
          any collected responses as PDF or JSON.
        </p>
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Fields</th>
              <th>Responses</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleCustomForms.map((f) => (
              <tr key={f.id}>
                <td>
                  <span className="ic-form-name">{f.name}</span>
                </td>
                <td>{f.kind === "survey" ? "Survey" : f.kind === "checklist" ? "Checklist" : "Form"}</td>
                <td>{f.fields.length}</td>
                <td>{f.responses.length}</td>
                <td>{f.status}</td>
                <td>
                  <span className="ic-cfb-lib-actions">
                    <button
                      type="button"
                      className="ic-btn-secondary ic-btn-secondary--sm"
                      onClick={() => void handleCustomFormPdf(f)}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className="ic-btn-secondary ic-btn-secondary--sm"
                      onClick={() => void handleCustomFormJson(f)}
                    >
                      JSON
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleCustomForms.length === 0 ? (
          <p className="ic-table-empty">
            No custom forms yet. Build one in the Forms section (Forms &amp; surveys tab).
          </p>
        ) : null}
      </section>

      <section className="ic-table-wrap">
        <h3 className="ic-library__section-title">Audit trail — TXT</h3>
        <p className="ic-library__section-hint">
          The complete activity log, exported as a plain-text file reflecting every entry recorded
          so far.
        </p>
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Entries</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="ic-form-name">Audit trail (live .txt)</span>
              </td>
              <td>{audit.length}</td>
              <td>
                <button
                  type="button"
                  className="ic-btn-secondary ic-btn-secondary--sm"
                  onClick={handleAuditTxt}
                >
                  TXT
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="ic-table-wrap">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h3 className="ic-library__section-title">Server archive</h3>
          <button
            type="button"
            className="ic-btn-secondary ic-btn-secondary--sm"
            onClick={() => void loadArchived()}
            disabled={archiveState === "loading"}
          >
            {archiveState === "loading" ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p className="ic-library__section-hint">
          Exports and uploads archived to this incident&apos;s server storage (PDF, TXT, JSON,
          photos). Available when signed in.
        </p>
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Size</th>
              <th>Saved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {archived.map((b) => (
              <tr key={b.id}>
                <td>
                  <span className="ic-form-name">{b.name}</span>
                </td>
                <td>{(b.kind && BLOB_KIND_LABEL[b.kind]) || b.kind || "File"}</td>
                <td>{formatBytes(b.sizeBytes)}</td>
                <td>{formatDate(b.createdAt)}</td>
                <td>
                  <a
                    className="ic-btn-secondary ic-btn-secondary--sm"
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {archived.length === 0 ? (
          <p className="ic-table-empty">
            {archiveState === "unauth"
              ? "Sign in to view server-archived exports."
              : archiveState === "error"
                ? "Server archive unavailable — the database isn’t running."
                : archiveState === "loading"
                  ? "Loading…"
                  : "No archived files yet. Exports are archived here automatically when you’re signed in."}
          </p>
        ) : null}
      </section>

      <section className="ic-table-wrap">
        <h3 className="ic-library__section-title">Other files</h3>
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Modified Date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td>
                  <InlineInput
                    value={l.name}
                    onChange={(v) => update(l.id, { name: v })}
                  />
                </td>
                <td>{formatDate(l.modifiedAt)}</td>
                <td>
                  <RowDelete onClick={() => remove(l.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No other files.</p> : null}
      </section>

      {/* Off-screen mount used only to snapshot a form to PDF on demand. Kept inside
          this tree so the FEMA layouts still receive the incident-store context. */}
      <div
        ref={hiddenExportRef}
        className="ic-ics-form-fema-wrap"
        aria-hidden
        style={{ position: "fixed", left: "-10000px", top: 0, width: "8.5in", pointerEvents: "none" }}
      >
        {exportForm ? <IcsFemaForm form={exportForm} onChange={() => {}} /> : null}
      </div>
    </section>
  );
}

export function MapAnnotationsView({ searchActive }: ViewProps) {
  const annotations = useIncidentStore((s) => s.mapAnnotations);
  const update = useIncidentStore((s) => s.updateMapAnnotation);
  const remove = useIncidentStore((s) => s.removeMapAnnotation);
  const { query, setQuery, filtered } = useSearchFilter(annotations, (a, q) =>
    a.name.toLowerCase().includes(q),
  );

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <section className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>
                  <InlineInput
                    value={a.name}
                    onChange={(v) => update(a.id, { name: v })}
                  />
                </td>
                <td>{a.kind}</td>
                <td>
                  <RowDelete onClick={() => remove(a.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="ic-table-empty">No map annotations.</p> : null}
      </section>
    </section>
  );
}

export function SettingsView() {
  const eventId = useEventId();
  const { data: session } = useSession();
  const state = useIncidentStore((s) => s);
  const settings = state.settings;
  const updateSettings = useIncidentStore((s) => s.updateSettings);
  const resetIncident = useIncidentStore((s) => s.resetIncident);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleJsonExport = async () => {
    const { filename, blob } = downloadIncidentExport(state);
    let archived = false;
    if (session) {
      const { uploadIncidentBlob } = await import("@/lib/storage/upload-client");
      const res = await uploadIncidentBlob(
        eventId,
        new File([blob], filename, { type: "application/json" }),
        "incident_json",
      );
      archived = res !== null;
    }
    setExportNotice(`Downloaded ${filename}${archived ? " · archived to server" : ""}`);
  };

  return (
    <section className="ic-settings">
      <label className="ic-field">
        <span>Timezone</span>
        <input
          type="text"
          value={settings.timezone}
          onChange={(e) => updateSettings({ timezone: e.target.value })}
        />
      </label>
      <label className="ic-field ic-field--checkbox">
        <input
          type="checkbox"
          checked={settings.enablePublicPortal}
          onChange={(e) => updateSettings({ enablePublicPortal: e.target.checked })}
        />
        <span>Enable public portal</span>
      </label>
      <label className="ic-field">
        <span>Bodycam offline threshold (seconds)</span>
        <input
          type="number"
          min={5}
          max={3600}
          step={5}
          value={settings.deviceOfflineAfterSec ?? 60}
          onChange={(e) => updateSettings({ deviceOfflineAfterSec: Number(e.target.value) })}
        />
        <small className="ic-field__hint">
          A bodycam with no telemetry check-in for this long is marked offline across Live Ops and
          the map (so nobody tries to reach a dark device). Default 60s.
        </small>
      </label>
      <button type="button" className="ic-btn-secondary" onClick={handleJsonExport}>
        Export incident (JSON)
      </button>
      {exportNotice ? <p className="ic-field__hint">{exportNotice}</p> : null}
      <button type="button" className="ic-btn-danger" onClick={() => resetIncident()}>
        Reset incident data
      </button>
    </section>
  );
}
