"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import { ElectricityWidget } from "@/components/dashboard/ElectricityWidget";
import { MetricGroup } from "@/components/dashboard/MetricGroup";
import { WidgetCard } from "@/components/dashboard/WidgetCard";
import { IconCalendar, IconList, IconMap, IconUsers } from "@/components/dashboard/icons";
import { ResidentsWidget } from "@/components/dashboard/ResidentsWidget";
import { useEventId, useIncidentStore } from "@/context/EventContext";
import { formatEventRange } from "@/lib/incident/calendar-utils";
import { dashboardStats } from "@/lib/incident/stats";
import { annotationsToFeatureCollection } from "@/lib/maps/map-annotations";
import { moduleHref } from "@/lib/navigation/modules";

const MapCanvasLazy = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => <p className="ic-empty-hint">Loading map…</p>,
});

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
