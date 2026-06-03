"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { ElectricityWidget } from "@/components/dashboard/ElectricityWidget";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { WidgetCard } from "@/components/dashboard/WidgetCard";
import { IconCalendar, IconList, IconMap, IconUsers } from "@/components/dashboard/icons";
import { useEventId } from "@/context/EventContext";
import { moduleHref } from "@/lib/navigation/modules";
import { FEMA_ICS_FORMS_INDEX_URL } from "@/lib/incident/ics-forms-catalog";
import { formatEventRange } from "@/lib/incident/calendar-utils";
import { annotationsToFeatureCollection } from "@/lib/maps/map-annotations";
import { downloadIncidentExport } from "@/lib/incident/export";
import { dashboardStats } from "@/lib/incident/stats";
import { sortResidentAreas, type ResidentAreaSortMode } from "@/lib/incident/residents";
import { sortUtilityRows, type UtilitySortMode } from "@/lib/incident/utilities";
import { CENSUS_SOURCE, CENSUS_YEAR, formatPopulation } from "@/lib/sa-population";
import { residentAreaPatchFromCensus, tryAutofillResidentAreaFromCity } from "@/lib/sa-population/resident-area";
import type { ResidentArea } from "@/lib/incident/types";
import { CensusCityField } from "./CensusCityField";
import { ResidentsWidget } from "@/components/dashboard/ResidentsWidget";
import { useIncidentStore } from "@/context/EventContext";
import type {
  ActivationLevel,
  DamageStatus,
  ResourceRequestStatus,
  RoadStatus,
  ShelterStatus,
  TaskItemStatus,
} from "@/lib/incident/types";

import {
  formatDate,
  InlineInput,
  InlineSelect,
  RowDelete,
  SortBar,
  StatusFilterBar,
  useSearchFilter,
} from "./shared";
import { FormsAddMenu } from "./FormsAddMenu";
import { IcsFormEditor } from "./IcsFormEditor";
import { EmptyHint, StatusBar, SummaryBar } from "./ui";

import { EventMapView } from "@/components/map/EventMapView";

const MapCanvasLazy = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => <p className="ic-empty-hint">Loading mapâ€¦</p>,
});

type ViewProps = {
  searchActive?: boolean;
  filterActive?: boolean;
  orgChartOpen?: boolean;
};

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

const ICS_WORKSPACES = [
  { id: "command", label: "Command", slugs: ["", "situation", "briefings", "roles"] },
  { id: "planning", label: "Planning", slugs: ["calendar", "forms", "map"] },
  { id: "operations", label: "Operations", slugs: ["tasks", "status-boards", "plays", "logs"] },
  { id: "logistics", label: "Logistics", slugs: ["resource-requests", "shelters", "personnel"] },
] as const;

export function DashboardHomeView() {
  const eventId = useEventId();
  const state = useIncidentStore((s) => s);
  const [workspace, setWorkspace] = useState<string>("command");
  const stats = dashboardStats(state);
  const ws = ICS_WORKSPACES.find((w) => w.id === workspace) ?? ICS_WORKSPACES[0];
  const mapCenter =
    state.situation.lat != null && state.situation.lng != null
      ? ([state.situation.lng, state.situation.lat] as [number, number])
      : null;

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <h1 className="ic-main__title">Command overview</h1>
        <p className="ic-dashboard-header__sub">
          D4H-style control room — switch ICS workspace, then open modules from the sidebar.
        </p>
        <nav className="ic-workspace-tabs" aria-label="ICS workspace">
          {ICS_WORKSPACES.map((w) => (
            <button
              key={w.id}
              type="button"
              className={workspace === w.id ? "ic-workspace-tabs__active" : ""}
              onClick={() => setWorkspace(w.id)}
            >
              {w.label}
            </button>
          ))}
        </nav>
        <p className="ic-workspace-quicklinks">
          {ws.slugs.map((slug) => {
            const label =
              slug === ""
                ? "Dashboard"
                : slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <Link key={slug || "home"} href={moduleHref(eventId, slug)} className="ic-workspace-link">
                {label}
              </Link>
            );
          })}
        </p>
      </header>
      <section className="ic-grid" aria-label="Dashboard widgets">
        <WidgetCard title="Log" icon={<IconList />} className="ic-grid__log">
          {stats.logPreview.length === 0 ? (
            <p className="ic-empty-hint">There are no events to display.</p>
          ) : (
            <ul className="ic-log-preview">
              {stats.logPreview.map((e) => (
                <li key={e.id}>
                  <strong>{e.author}</strong> {e.message}
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
        <WidgetCard title="Map" icon={<IconMap />} className="ic-grid__map">
          <MapCanvasLazy
            center={mapCenter}
            zoom={10}
            incidentMarker={mapCenter}
            overlays={annotationsToFeatureCollection(state.mapAnnotations)}
          />
        </WidgetCard>
        <WidgetCard title="Personnel" icon={<IconUsers />} className="ic-grid__personnel">
          <MetricGroup
            items={[
              { value: stats.personnelTotal, label: "Total count" },
              { value: stats.personnelOnline, label: "Online now" },
            ]}
          />
        </WidgetCard>
        <WidgetCard title="Damage Assessment" icon={<IconList />}>
          <MetricGroup
            items={[
              { value: stats.minorDamage, label: "Minor Damage" },
              { value: stats.severeDamage, label: "Severe Damage" },
            ]}
          />
        </WidgetCard>
        <WidgetCard title="Utilities-Electricity" icon={<IconList />}>
          <ElectricityWidget
            customersWithoutPower={stats.electricityOutages}
            utilities={state.utilities}
            lat={state.situation.lat}
            lng={state.situation.lng}
          />
        </WidgetCard>
        <WidgetCard title="Residents" icon={<IconList />}>
          <ResidentsWidget
            areas={state.residentAreas}
            individualsCount={stats.residentsTotal}
          />
        </WidgetCard>
        <WidgetCard title="Road Damages" icon={<IconList />}>
          <MetricGroup
            items={[
              { value: stats.roadClosed, label: "Closed" },
              { value: stats.roadOneLane, label: "One lane" },
              { value: stats.roadOpen, label: "Open" },
            ]}
          />
        </WidgetCard>
        <WidgetCard title="Shelters" icon={<IconList />}>
          <MetricGroup items={[{ value: stats.sheltersTotal, label: "Total count" }]} />
        </WidgetCard>
        <WidgetCard title="All Tasks" icon={<IconList />}>
          <MetricGroup
            items={[
              { value: stats.taskCounts.canceled, label: "Canceled" },
              { value: stats.taskCounts.complete, label: "Complete" },
              { value: stats.taskCounts.in_progress, label: "In Progress" },
              { value: stats.taskCounts.not_started, label: "Not Started" },
            ]}
          />
        </WidgetCard>
        <WidgetCard title="Resource Requests" icon={<IconList />}>
          <MetricGroup
            items={[
              { value: stats.resourceRequests.ready, label: "Ready" },
              { value: stats.resourceRequests.enroute, label: "Enroute" },
              { value: stats.resourceRequests.assigned, label: "Assigned" },
              { value: stats.resourceRequests.requested, label: "Requested" },
            ]}
          />
        </WidgetCard>
        <WidgetCard title="My Tasks" icon={<IconList />}>
          <MetricGroup
            items={[
              { value: stats.taskCounts.canceled, label: "Canceled" },
              { value: stats.taskCounts.complete, label: "Complete" },
              { value: stats.taskCounts.in_progress, label: "In Progress" },
              { value: stats.taskCounts.not_started, label: "Not Started" },
            ]}
          />
        </WidgetCard>
        <WidgetCard title="Calendar" icon={<IconCalendar />} className="ic-grid__calendar">
          {stats.upcomingEvents.length === 0 ? (
            <p className="ic-empty-hint">
              No upcoming events.{" "}
              <Link href={moduleHref(eventId, "calendar")} className="ic-accent-link">
                Open calendar
              </Link>
            </p>
          ) : (
            <ul className="ic-cal-widget-list">
              {stats.upcomingEvents.map((e) => (
                <li key={e.id}>
                  <strong>{e.title}</strong>
                  <span>{formatEventRange(e.startAt, e.endAt, e.allDay)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="ic-widget__sub">
            {stats.operationalPeriodCount} operational period
            {stats.operationalPeriodCount === 1 ? "" : "s"}
          </p>
        </WidgetCard>
      </section>
    </div>
  );
}

export function SituationView() {
  const situation = useIncidentStore((s) => s.situation);
  const updateSituation = useIncidentStore((s) => s.updateSituation);
  const setActivationLevel = useIncidentStore((s) => s.setActivationLevel);

  const levels: { value: ActivationLevel; label: string }[] = [
    { value: "planning", label: "Planning" },
    { value: "activated", label: "Activated" },
    { value: "closed", label: "Closed" },
  ];

  return (
    <section className="ic-situation">
      <header className="ic-situation-header">
        <div className="ic-situation-header__intro">
          <h2 className="ic-situation-header__title">Situation</h2>
          <p className="ic-situation-header__sub">
            Event identity, dates, location, and operational summary
          </p>
        </div>
        <nav className="ic-activation-bar" aria-label="Activation level">
          {levels.map((l) => (
            <button
              key={l.value}
              type="button"
              className={`ic-activation-bar__btn ic-activation-bar__btn--${l.value}${
                situation.activationLevel === l.value ? " ic-activation-bar__active" : ""
              }`}
              onClick={() => setActivationLevel(l.value)}
              aria-pressed={situation.activationLevel === l.value}
            >
              {l.label}
            </button>
          ))}
        </nav>
      </header>
      <form
        className="ic-situation__form"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="ic-field">
          <span>Incident Name</span>
          <input
            type="text"
            value={situation.name}
            onChange={(e) => updateSituation({ name: e.target.value })}
          />
        </label>
        <label className="ic-field">
          <span>Start Date</span>
          <input
            type="datetime-local"
            value={situation.startDate}
            onChange={(e) => updateSituation({ startDate: e.target.value })}
          />
        </label>
        <label className="ic-field">
          <span>End Date</span>
          <input
            type="datetime-local"
            value={situation.endDate}
            onChange={(e) => updateSituation({ endDate: e.target.value })}
          />
        </label>
        <label className="ic-field ic-field--full">
          <span>Location</span>
          <input
            type="text"
            placeholder="Address or place name"
            value={situation.location}
            onChange={(e) => updateSituation({ location: e.target.value })}
          />
        </label>
        <label className="ic-field">
          <span>Latitude</span>
          <input
            type="number"
            step="any"
            placeholder="e.g. 40.7128"
            value={situation.lat ?? ""}
            onChange={(e) =>
              updateSituation({
                lat: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label className="ic-field">
          <span>Longitude</span>
          <input
            type="number"
            step="any"
            placeholder="e.g. -74.0060"
            value={situation.lng ?? ""}
            onChange={(e) =>
              updateSituation({
                lng: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
        <label className="ic-field ic-field--full">
          <span>Situation Summary</span>
          <textarea
            rows={5}
            value={situation.summary}
            onChange={(e) => updateSituation({ summary: e.target.value })}
          />
        </label>
        <label className="ic-field ic-field--full">
          <span>Current and Planned Objectives</span>
          <textarea
            rows={5}
            value={situation.objectives}
            onChange={(e) => updateSituation({ objectives: e.target.value })}
          />
        </label>
        <label className="ic-field ic-field--full">
          <span>Key contacts (agencies, liaisons)</span>
          <textarea
            rows={4}
            placeholder="Name â€” role â€” phone / email"
            value={situation.keyContacts ?? ""}
            onChange={(e) => updateSituation({ keyContacts: e.target.value })}
          />
        </label>
      </form>
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

export function FormsView() {
  const forms = useIncidentStore((s) => s.forms);
  const addForm = useIncidentStore((s) => s.addForm);
  const updateForm = useIncidentStore((s) => s.updateForm);
  const removeForm = useIncidentStore((s) => s.removeForm);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = forms.find((f) => f.id === selectedId) ?? null;

  const handleAddForm = (templateId: string) => {
    const id = addForm(templateId);
    if (id) setSelectedId(id);
  };

  return (
    <section className="ic-forms-layout">
      <header className="ic-forms-header">
        <a
          href={FEMA_ICS_FORMS_INDEX_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ic-forms-header__link"
        >
          Official FEMA ICS forms â†—
        </a>
        <div className="ic-forms-add">
          <button type="button" className="ic-btn-add" onClick={() => setMenuOpen(true)}>
            + Add ICS form â–¾
          </button>
          <FormsAddMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onSelect={handleAddForm}
          />
        </div>
      </header>
      <div className="ic-forms-split">
        <section className="ic-table-wrap">
          <table className="ic-table ic-table--clickable">
            <thead>
              <tr>
                <th>Form</th>
                <th>IAP</th>
                <th>Status</th>
                <th>Modified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr
                  key={f.id}
                  className={selectedId === f.id ? "ic-table__row--selected" : ""}
                  onClick={() => setSelectedId(f.id)}
                >
                  <td>
                    <span className="ic-form-name">{f.name}</span>
                    {f.formNumber ? (
                      <span className="ic-form-number">ICS {f.formNumber}</span>
                    ) : null}
                  </td>
                  <td>{f.inIap ? "Yes" : "â€”"}</td>
                  <td>{f.status ?? "draft"}</td>
                  <td>{formatDate(f.modifiedAt)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <RowDelete
                      onClick={() => {
                        removeForm(f.id);
                        if (selectedId === f.id) setSelectedId(null);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {forms.length === 0 ? <p className="ic-table-empty">No forms yet.</p> : null}
        </section>
        {selected ? (
          <aside className="ic-form-editor ic-form-editor--fema">
            <header className="ic-form-editor__head">
              <div>
                <h3>{selected.name}</h3>
                {selected.officialTitle ? (
                  <p className="ic-form-editor__subtitle">{selected.officialTitle}</p>
                ) : null}
              </div>
              {selected.pdfUrl ? (
                <a
                  href={selected.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ic-btn-secondary ic-btn-secondary--sm"
                >
                  Official PDF â†—
                </a>
              ) : null}
            </header>
            <label className="ic-field">
              <span>Status</span>
              <select
                value={selected.status ?? "draft"}
                onChange={(e) =>
                  updateForm(selected.id, {
                    status: e.target.value as "draft" | "published",
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <IcsFormEditor
              form={selected}
              onChange={(patch) => updateForm(selected.id, patch)}
            />
          </aside>
        ) : (
          <aside className="ic-form-editor ic-form-editor--empty">
            <p className="ic-empty-hint">Select a form to edit.</p>
          </aside>
        )}
      </div>
    </section>
  );
}

export function MapView() {
  return <EventMapView />;
}

export function LogsView() {
  const logs = useIncidentStore((s) => s.logs);
  const audit = useIncidentStore((s) => s.audit);
  const addLog = useIncidentStore((s) => s.addLog);
  const [tab, setTab] = useState<"log" | "audit">("log");
  const [message, setMessage] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

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

  const entries = tab === "log" ? logs : audit;

  return (
    <section className="ic-logs">
      <nav className="ic-tabs">
        <button
          type="button"
          className={tab === "log" ? "ic-tabs__active" : ""}
          onClick={() => setTab("log")}
        >
          Log
        </button>
        <button
          type="button"
          className={tab === "audit" ? "ic-tabs__active" : ""}
          onClick={() => setTab("audit")}
        >
          Audit
        </button>
      </nav>
      {entries.length === 0 ? (
        <p className="ic-empty-hint ic-logs__empty">There are no events to display.</p>
      ) : (
        <ul className="ic-log-list">
          {entries.map((e) => (
            <li key={e.id} className="ic-log-list__item">
              <time>{formatDate(e.createdAt)}</time>
              {"author" in e ? (
                <span>
                  <strong>{e.author}</strong> {e.message}
                  {e.tags?.length ? (
                    <span className="ic-log-tags">
                      {e.tags.map((t) => (
                        <span key={t} className="ic-log-tag">
                          {t}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : (
                <span>
                  <strong>{e.actor}</strong> {e.action}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {tab === "log" ? (
        <footer className="ic-log-composer">
          {tags.length > 0 ? (
            <div className="ic-log-composer__tags">
              {tags.map((t) => (
                <span key={t} className="ic-log-tag">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                    Ã—
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <input
            type="text"
            placeholder="Message"
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
            âž¤
          </button>
        </footer>
      ) : null}
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
                    value={r.costPerHour}
                    onChange={(v) => update(r.id, { costPerHour: Number(v) || 0 })}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    value={r.hours}
                    onChange={(v) => update(r.id, { hours: Number(v) || 0 })}
                  />
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
      <h2 className="ic-page-heading">Shelter Occupancy: {occupancy}</h2>
      <section className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Capacity</th>
              <th>Occupancy</th>
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
                    value={s.capacity}
                    onChange={(v) => update(s.id, { capacity: Number(v) || 0 })}
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
                    value={s.occupancy}
                    onChange={(v) => update(s.id, { occupancy: Number(v) || 0 })}
                  />
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
                    value={u.customersWithoutPower}
                    onChange={(v) =>
                      update(u.id, { customersWithoutPower: Number(v) || 0 })
                    }
                  />
                </td>
                <td>
                  <InlineInput
                    type="number"
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
  const update = useIncidentStore((s) => s.updatePersonnel);
  const remove = useIncidentStore((s) => s.removePersonnel);
  const { query, setQuery, filtered } = useSearchFilter(personnel, (p, q) =>
    p.name.toLowerCase().includes(q),
  );

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <section className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Online</th>
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
                  <input
                    type="checkbox"
                    checked={p.online}
                    onChange={(e) => update(p.id, { online: e.target.checked })}
                  />
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

export function WeatherView() {
  const eventId = useEventId();
  const lat = useIncidentStore((s) => s.situation.lat);
  const lng = useIncidentStore((s) => s.situation.lng);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weather?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSummary(
          data.headline
            ? `${data.headline}${data.detail ? ` â€” ${data.detail}` : ""}`
            : JSON.stringify(data),
        );
      })
      .catch(() => {
        if (!cancelled) setSummary("Unable to load weather.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

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

  return (
    <section className="ic-weather">
      <h2 className="ic-page-heading">Weather at {lat.toFixed(4)}, {lng.toFixed(4)}</h2>
      {loading ? <p className="ic-empty-hint">Loading forecastâ€¦</p> : <p>{summary}</p>}
    </section>
  );
}

export function LibraryView({ searchActive }: ViewProps) {
  const library = useIncidentStore((s) => s.library);
  const update = useIncidentStore((s) => s.updateLibraryItem);
  const remove = useIncidentStore((s) => s.removeLibraryItem);
  const { query, setQuery, filtered } = useSearchFilter(library, (l, q) =>
    l.name.toLowerCase().includes(q),
  );

  return (
    <section>
      <SearchBar active={searchActive} query={query} onQuery={setQuery} />
      <section className="ic-table-wrap">
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
        {filtered.length === 0 ? <p className="ic-table-empty">No library items.</p> : null}
      </section>
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
  const state = useIncidentStore((s) => s);
  const settings = state.settings;
  const updateSettings = useIncidentStore((s) => s.updateSettings);
  const resetIncident = useIncidentStore((s) => s.resetIncident);

  return (
    <section className="ic-settings">
      <h2 className="ic-page-heading">Incident settings</h2>
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
      <button type="button" className="ic-btn-secondary" onClick={() => downloadIncidentExport(state)}>
        Export incident (JSON)
      </button>
      <button type="button" className="ic-btn-danger" onClick={() => resetIncident()}>
        Reset incident data
      </button>
    </section>
  );
}
