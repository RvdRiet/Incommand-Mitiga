"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export type ModuleViewProps = {
  searchActive?: boolean;
  filterActive?: boolean;
  orgChartOpen?: boolean;
};

function viewLoading() {
  return <p className="ic-empty-hint">Loading module…</p>;
}

function lazyView(
  loader: () => Promise<{ default: ComponentType<ModuleViewProps> }>,
) {
  return dynamic(loader, { ssr: false, loading: viewLoading });
}

/** Per-module chunks so the dashboard route does not load map + PDF + all tables at once. */
export const MODULE_VIEW_LOADERS: Record<
  string,
  ComponentType<ModuleViewProps>
> = {
  "": lazyView(() =>
    import("./view-modules/dashboard").then((m) => ({ default: m.DashboardHomeView })),
  ),
  map: lazyView(() => import("./view-modules/map").then((m) => ({ default: m.MapView }))),
  forms: lazyView(() =>
    import("./view-modules/forms").then((m) => ({ default: m.FormsView })),
  ),
  situation: lazyView(() =>
    import("./views").then((m) => ({ default: m.SituationView })),
  ),
  calendar: lazyView(() =>
    import("./CalendarView").then((m) => ({ default: m.CalendarView })),
  ),
  roles: lazyView(() => import("./views").then((m) => ({ default: m.RolesView }))),
  logs: lazyView(() => import("./views").then((m) => ({ default: m.LogsView }))),
  tasks: lazyView(() =>
    import("./d4h/TasksEnhancedView").then((m) => ({ default: m.TasksEnhancedView })),
  ),
  "status-boards": lazyView(() =>
    import("./d4h/StatusBoardsView").then((m) => ({ default: m.StatusBoardsView })),
  ),
  plays: lazyView(() =>
    import("./d4h/PlaysView").then((m) => ({ default: m.PlaysView })),
  ),
  briefings: lazyView(() =>
    import("./d4h/BriefingsView").then((m) => ({ default: m.BriefingsView })),
  ),
  notifications: lazyView(() =>
    import("./d4h/NotificationsView").then((m) => ({ default: m.NotificationsView })),
  ),
  "damage-assessment": lazyView(() =>
    import("./views").then((m) => ({ default: m.DamageAssessmentView })),
  ),
  residents: lazyView(() =>
    import("./views").then((m) => ({ default: m.ResidentsView })),
  ),
  "resource-requests": lazyView(() =>
    import("./views").then((m) => ({ default: m.ResourceRequestsView })),
  ),
  "road-damages": lazyView(() =>
    import("./views").then((m) => ({ default: m.RoadDamagesView })),
  ),
  shelters: lazyView(() =>
    import("./views").then((m) => ({ default: m.SheltersView })),
  ),
  "utilities-electricity": lazyView(() =>
    import("./views").then((m) => ({ default: m.UtilitiesView })),
  ),
  personnel: lazyView(() =>
    import("./views").then((m) => ({ default: m.PersonnelView })),
  ),
  weather: lazyView(() =>
    import("./views").then((m) => ({ default: m.WeatherView })),
  ),
  library: lazyView(() => import("./views").then((m) => ({ default: m.LibraryView }))),
  "map-annotations": lazyView(() =>
    import("./views").then((m) => ({ default: m.MapAnnotationsView })),
  ),
  settings: lazyView(() =>
    import("./views").then((m) => ({ default: m.SettingsView })),
  ),
  comms: lazyView(() =>
    import("./CommsView").then((m) => ({ default: m.CommsView })),
  ),
  "track-history": lazyView(() =>
    import("./view-modules/track-history").then((m) => ({ default: m.TrackHistoryView })),
  ),
  outages: lazyView(() =>
    import("./view-modules/outages").then((m) => ({ default: m.OutageMapView })),
  ),
  rostering: lazyView(() =>
    import("./view-modules/rostering").then((m) => ({ default: m.RosteringView })),
  ),
  certifications: lazyView(() =>
    import("./view-modules/certifications").then((m) => ({ default: m.CertificationsView })),
  ),
  inventory: lazyView(() =>
    import("./view-modules/inventory").then((m) => ({ default: m.InventoryView })),
  ),
  analytics: lazyView(() =>
    import("./view-modules/analytics").then((m) => ({ default: m.AnalyticsView })),
  ),
  "hub-situation": lazyView(() =>
    import("./view-modules/area-hub").then((m) => ({ default: m.SituationHubView })),
  ),
  "hub-plans": lazyView(() =>
    import("./view-modules/area-hub").then((m) => ({ default: m.PlansHubView })),
  ),
  "hub-operations": lazyView(() =>
    import("./view-modules/area-hub").then((m) => ({ default: m.OperationsHubView })),
  ),
  "hub-people": lazyView(() =>
    import("./view-modules/area-hub").then((m) => ({ default: m.PeopleHubView })),
  ),
  "hub-comms": lazyView(() =>
    import("./view-modules/area-hub").then((m) => ({ default: m.CommsHubView })),
  ),
  "hub-records": lazyView(() =>
    import("./view-modules/area-hub").then((m) => ({ default: m.RecordsHubView })),
  ),
};

export const DefaultModuleView = lazyView(() =>
  import("./view-modules/dashboard").then((m) => ({ default: m.DashboardHomeView })),
);
