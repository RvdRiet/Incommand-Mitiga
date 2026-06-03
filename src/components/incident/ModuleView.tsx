"use client";

import type { ComponentType } from "react";

import { CalendarView } from "./CalendarView";
import {
  DashboardHomeView,
  DamageAssessmentView,
  FormsView,
  LibraryView,
  LogsView,
  MapAnnotationsView,
  MapView,
  PersonnelView,
  ResidentsView,
  ResourceRequestsView,
  RoadDamagesView,
  RolesView,
  SettingsView,
  SheltersView,
  SituationView,
  TasksView,
  UtilitiesView,
  WeatherView,
} from "./views";
import { BriefingsView } from "./d4h/BriefingsView";
import { NotificationsView } from "./d4h/NotificationsView";
import { PlaysView } from "./d4h/PlaysView";
import { StatusBoardsView } from "./d4h/StatusBoardsView";

type ViewProps = {
  searchActive?: boolean;
  filterActive?: boolean;
  orgChartOpen?: boolean;
};

const VIEW_BY_SLUG: Record<string, ComponentType<ViewProps>> = {
  "": DashboardHomeView,
  situation: SituationView,
  calendar: CalendarView,
  roles: RolesView,
  forms: FormsView,
  map: MapView,
  logs: LogsView,
  tasks: TasksView,
  "status-boards": StatusBoardsView,
  plays: PlaysView,
  briefings: BriefingsView,
  notifications: NotificationsView,
  "damage-assessment": DamageAssessmentView,
  residents: ResidentsView,
  "resource-requests": ResourceRequestsView,
  "road-damages": RoadDamagesView,
  shelters: SheltersView,
  "utilities-electricity": UtilitiesView,
  personnel: PersonnelView,
  weather: WeatherView,
  library: LibraryView,
  "map-annotations": MapAnnotationsView,
  settings: SettingsView,
};

export function ModuleView({
  slug,
  searchActive = false,
  filterActive = false,
  orgChartOpen = false,
}: {
  slug: string;
  searchActive?: boolean;
  filterActive?: boolean;
  orgChartOpen?: boolean;
}) {
  const View = VIEW_BY_SLUG[slug] ?? DashboardHomeView;
  const viewProps = { searchActive, filterActive, orgChartOpen };
  if (!slug) {
    return <View {...viewProps} />;
  }
  return (
    <div className="ic-view">
      <View {...viewProps} />
    </div>
  );
}
