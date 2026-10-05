import type { Feature, LineString } from "geojson";

export type RouteWaypoint = {
  lat: number;
  lng: number;
  label: string;
};

export type RouteScenario =
  | "standard"
  | "traffic"
  | "riot"
  | "emergency"
  | "diversion";

export type RouteVariant = {
  id: string;
  scenario: RouteScenario;
  label: string;
  description: string;
  distanceMeters: number;
  durationSeconds: number;
  geojson: Feature<LineString>;
  googleMapsUrl: string;
  waypoints: RouteWaypoint[];
  /** Engine that produced this line. "google" is traffic-aware but ONLINE-ONLY;
   *  "osrm" (default) is free, offline-capable, and freely persistable. */
  provider?: "osrm" | "google";
  /** durationSeconds reflects live traffic (Google departure_time=now). */
  trafficAware?: boolean;
};

export type SupplyRouteStatus = "planning" | "active" | "completed";

export type SupplyRoute = {
  id: string;
  name: string;
  purpose: string;
  origin: RouteWaypoint;
  destination: RouteWaypoint;
  /** Driver current position when recalculating mid-journey */
  midJourneyOrigin: RouteWaypoint | null;
  viaPoints: RouteWaypoint[];
  avoidAnnotationId: string | null;
  variants: RouteVariant[];
  selectedVariantId: string | null;
  status: SupplyRouteStatus;
  briefingNotes: string;
  createdAt: string;
  updatedAt: string;
};

export const ROUTE_SCENARIO_META: Record<
  RouteScenario,
  { label: string; description: string }
> = {
  standard: {
    label: "Primary",
    description: "Fastest OSM driving route — default dispatch",
  },
  traffic: {
    label: "Traffic alternate",
    description: "Alternative path when congestion is reported",
  },
  riot: {
    label: "Civil unrest bypass",
    description: "Routes around a blocked or unsafe area",
  },
  emergency: {
    label: "Emergency diversion",
    description: "Wide detour for closures, hazards, or cordons",
  },
  diversion: {
    label: "Manual via point",
    description: "Custom path through a planner-placed waypoint",
  },
};
