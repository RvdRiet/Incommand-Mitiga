import type { Feature, LineString, Position } from "geojson";

import { newId } from "@/lib/incident/id";

import { distanceMeters } from "./geo-utils";
import { buildGoogleMapsDirectionsUrl } from "./google-maps-url";
import { planGooglePrimaryVariant } from "./google-routing";
import {
  corridorOffsetMeters,
  corridorViaFromRoute,
  drivingGeometryFromRoute,
  maxAllowedRouteMeters,
  MAX_ROUTE_EXTRA_M,
  MIN_ROUTE_EXTRA_M,
  validateDrivingGeometry,
  type OsrmRouteWithLegs,
} from "./route-geometry";
import type { RouteScenario, RouteVariant, RouteWaypoint } from "./routing-types";
import { ROUTE_SCENARIO_META } from "./routing-types";

const OSRM_BASE =
  process.env.OSRM_BASE_URL?.replace(/\/$/, "") ??
  "https://router.project-osrm.org";

/** Public OSRM supports alternatives=true (typically 2–3 on shorter legs). */
const OSRM_ALT_PARAM = "true";
const MAX_SNAP_ENDPOINT_M = 2_500;
const MAX_SNAP_VIA_M = 1_200;
const MAX_GEOMETRY_ENDPOINT_GAP_M = 400;

const OSRM_ROUTE_PARAMS =
  "overview=full&geometries=geojson&steps=true&annotations=false";

type OsrmWaypoint = {
  location: [number, number];
  distance: number;
  name?: string;
};

type OsrmRouteResponse = {
  routes?: OsrmRouteWithLegs[];
  waypoints?: OsrmWaypoint[];
  code?: string;
};

export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

export { geocodeSearch } from "./geocode";

function coordsPath(points: RouteWaypoint[]): string {
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}

function radiusesParam(pointCount: number, viaRadiusM = MAX_SNAP_VIA_M): string {
  return Array.from({ length: pointCount }, (_, i) => {
    if (i === 0 || i === pointCount - 1) return MAX_SNAP_ENDPOINT_M;
    return viaRadiusM;
  }).join(";");
}

async function snapToRoad(wp: RouteWaypoint): Promise<RouteWaypoint | null> {
  const url = `${OSRM_BASE}/nearest/v1/driving/${wp.lng},${wp.lat}?number=1`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = (await res.json()) as { code?: string; waypoints?: OsrmWaypoint[] };
  if (data.code !== "Ok" || !data.waypoints?.[0]) return null;
  const hit = data.waypoints[0];
  if (hit.distance > MAX_SNAP_ENDPOINT_M) return null;
  const [lng, lat] = hit.location;
  return { lng, lat, label: wp.label || hit.name || "Snapped" };
}

function snappedWaypointsFromResponse(
  requested: RouteWaypoint[],
  osrmWaypoints: OsrmWaypoint[],
): RouteWaypoint[] {
  return requested.map((req, i) => {
    const hit = osrmWaypoints[i];
    if (!hit) return req;
    return {
      lng: hit.location[0],
      lat: hit.location[1],
      label: req.label || hit.name || "Waypoint",
    };
  });
}

function geometrySignature(geometry: LineString): string {
  const c = geometry.coordinates;
  if (c.length < 2) return "";
  const mid = c[Math.floor(c.length / 2)]!;
  const end = c[c.length - 1]!;
  return `${Math.round(mid[0]! * 1000)}:${Math.round(mid[1]! * 1000)}:${Math.round(end[0]! * 1000)}:${Math.round(end[1]! * 1000)}:${c.length}`;
}

function polygonCentroid(ring: Position[]): RouteWaypoint | null {
  if (ring.length < 3) return null;
  let sumLng = 0;
  let sumLat = 0;
  let n = 0;
  for (const [lng, lat] of ring) {
    if (lng == null || lat == null) continue;
    sumLng += lng;
    sumLat += lat;
    n++;
  }
  if (n === 0) return null;
  return { lng: sumLng / n, lat: sumLat / n, label: "Avoid area" };
}

/** Bypass via on road network only — used when an avoid polygon is set. */
export function computeBypassVia(
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  avoidRing: Position[],
  scaleFactor = 1,
): RouteWaypoint | null {
  const centroid = polygonCentroid(avoidRing);
  if (!centroid) return null;

  const midLat = (origin.lat + destination.lat) / 2;
  const midLng = (origin.lng + destination.lng) / 2;
  const legM = Math.max(distanceMeters(origin.lng, origin.lat, destination.lng, destination.lat), 500);
  const pushM = Math.min(Math.max(legM * 0.22 * scaleFactor, 800), 12_000);

  const toMidLng = midLng - centroid.lng;
  const toMidLat = midLat - centroid.lat;
  const len = Math.hypot(toMidLng, toMidLat) || 1;
  const scale = pushM / 111_320;

  return {
    lng: midLng + (toMidLng / len) * scale,
    lat: midLat + (toMidLat / len) * scale,
    label: "Bypass waypoint",
  };
}

type ValidatedRoute = {
  route: OsrmRouteWithLegs;
  geometry: LineString;
  waypoints: OsrmWaypoint[];
};

function validateOsrmRoute(
  data: OsrmRouteResponse | null,
  requested: RouteWaypoint[],
  opts: { primaryRouteM?: number },
): ValidatedRoute | null {
  if (!data || data.code !== "Ok") return null;
  const route = data.routes?.[0];
  const waypoints = data.waypoints;
  if (!route || !waypoints || waypoints.length !== requested.length) return null;

  for (let i = 0; i < waypoints.length; i++) {
    const maxSnap = i === 0 || i === waypoints.length - 1 ? MAX_SNAP_ENDPOINT_M : MAX_SNAP_VIA_M;
    if (waypoints[i]!.distance > maxSnap) return null;
  }

  let geometry = drivingGeometryFromRoute(route);
  let roadCheck = validateDrivingGeometry(geometry, route.distance);
  if (!roadCheck.ok && route.geometry?.coordinates?.length >= 2) {
    const overviewCheck = validateDrivingGeometry(route.geometry, route.distance, true);
    if (overviewCheck.ok) {
      geometry = route.geometry;
      roadCheck = overviewCheck;
    }
  }
  if (!roadCheck.ok) return null;

  const lastCoord = geometry.coordinates[geometry.coordinates.length - 1]!;
  const destSnap = waypoints[waypoints.length - 1]!.location;
  if (
    distanceMeters(lastCoord[0]!, lastCoord[1]!, destSnap[0], destSnap[1]) >
    MAX_GEOMETRY_ENDPOINT_GAP_M
  ) {
    return null;
  }

  if (opts.primaryRouteM != null && route.distance > maxAllowedRouteMeters(opts.primaryRouteM)) {
    return null;
  }

  return { route, geometry, waypoints };
}

async function requestOsrm(
  points: RouteWaypoint[],
  withAlternatives: boolean,
  opts?: { viaRadiusM?: number },
): Promise<OsrmRouteResponse | null> {
  if (points.length < 2) return null;
  const path = coordsPath(points);
  const altParam = withAlternatives ? `&alternatives=${OSRM_ALT_PARAM}` : "";
  const url =
    `${OSRM_BASE}/route/v1/driving/${path}?${OSRM_ROUTE_PARAMS}` +
    `${altParam}&radiuses=${radiusesParam(points.length, opts?.viaRadiusM)}&continue_straight=true`;

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  return (await res.json()) as OsrmRouteResponse;
}

async function generateCorridorAlternates(
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  primary: ValidatedRoute,
  primaryRouteM: number,
  pushValidated: (
    validated: ValidatedRoute,
    scenario: RouteScenario,
    label: string,
    description: string,
    viaPoints: RouteWaypoint[],
  ) => void,
): Promise<void> {
  const offsetM = corridorOffsetMeters(primaryRouteM);
  const candidates: { fraction: number; side: -1 | 1; label: string }[] = [
    { fraction: 0.38, side: -1, label: "Northern corridor" },
    { fraction: 0.38, side: 1, label: "Southern corridor" },
    { fraction: 0.62, side: -1, label: "Western corridor" },
    { fraction: 0.62, side: 1, label: "Eastern corridor" },
  ];

  for (const c of candidates) {
    const rawVia = corridorViaFromRoute(
      primary.geometry,
      c.fraction,
      c.side,
      offsetM,
      c.label,
    );
    if (!rawVia) continue;

    const snappedVia = await snapToRoad(rawVia);
    if (!snappedVia) continue;

    const viaData = await requestOsrm([origin, snappedVia, destination], false, {
      viaRadiusM: 5_000,
    });
    const validated = validateOsrmRoute(viaData, [origin, snappedVia, destination], {
      primaryRouteM,
    });
    if (!validated) continue;

    const extra = validated.route.distance - primaryRouteM;
    if (extra < MIN_ROUTE_EXTRA_M) continue;

    pushValidated(
      validated,
      "traffic",
      c.label,
      `Corridor alternate (+${Math.round(extra / 1000)} km) — follows roads via a parallel leg`,
      [snappedVia],
    );
  }
}

function variantFromValidated(
  validated: ValidatedRoute,
  scenario: RouteScenario,
  label: string,
  description: string,
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  viaPoints: RouteWaypoint[],
): RouteVariant {
  const requested = [origin, ...viaPoints, destination];
  const snapped = snappedWaypointsFromResponse(requested, validated.waypoints);
  const routeOrigin = snapped[0]!;
  const routeDest = snapped[snapped.length - 1]!;
  const routeVias = snapped.slice(1, -1);

  return {
    id: `${scenario}-${newId()}`,
    scenario,
    label,
    description,
    distanceMeters: Math.round(validated.route.distance),
    durationSeconds: Math.round(validated.route.duration),
    geojson: {
      type: "Feature",
      properties: { scenario },
      geometry: validated.geometry,
    },
    googleMapsUrl: buildGoogleMapsDirectionsUrl(routeOrigin, routeDest, routeVias),
    waypoints: snapped,
    provider: "osrm",
  };
}

export type PlanRoutesInput = {
  origin: RouteWaypoint;
  destination: RouteWaypoint;
  viaPoints?: RouteWaypoint[];
  avoidPolygon?: Position[];
  midJourneyOrigin?: RouteWaypoint | null;
};

export async function planRouteVariants(input: PlanRoutesInput): Promise<RouteVariant[]> {
  const rawOrigin = input.midJourneyOrigin ?? input.origin;
  const rawDestination = input.destination;

  const origin = (await snapToRoad(rawOrigin)) ?? rawOrigin;
  const destination = (await snapToRoad(rawDestination)) ?? rawDestination;
  const manualVia = input.viaPoints ?? [];

  const variants: RouteVariant[] = [];
  const seenGeom = new Set<string>();
  let primaryRouteM: number | undefined;

  const pushValidated = (
    validated: ValidatedRoute,
    scenario: RouteScenario,
    label: string,
    description: string,
    viaPoints: RouteWaypoint[],
  ) => {
    const sig = geometrySignature(validated.geometry);
    if (!sig || seenGeom.has(sig)) return;
    seenGeom.add(sig);
    variants.push(
      variantFromValidated(validated, scenario, label, description, origin, destination, viaPoints),
    );
  };

  let primaryValidated: ValidatedRoute | null = null;

  // MAIN ONLINE ENGINE: Google traffic-aware primary. When it returns a route
  // (keyed + online), it becomes the "standard" variant and the OSRM direct route
  // below is relabelled as the offline alternate. When Google is null (no key /
  // offline / no route), OSRM is the primary — the offline backup — as before.
  const googlePrimary = await planGooglePrimaryVariant(origin, destination);
  if (googlePrimary) {
    const sig = geometrySignature(googlePrimary.geojson.geometry);
    if (sig) seenGeom.add(sig);
    variants.push(googlePrimary);
  }
  const hasGooglePrimary = googlePrimary != null;

  const directData = await requestOsrm([origin, destination], true);
  const endpointsSnapOk =
    directData?.code === "Ok" &&
    directData.waypoints?.length === 2 &&
    directData.waypoints.every((wp) => wp.distance <= MAX_SNAP_ENDPOINT_M);

  if (endpointsSnapOk && directData.waypoints) {
    for (let i = 0; i < (directData.routes ?? []).length; i++) {
      const route = directData.routes![i]!;
      const validated = validateOsrmRoute(
        { code: "Ok", routes: [route], waypoints: directData.waypoints! },
        [origin, destination],
        { primaryRouteM: i === 0 ? undefined : primaryRouteM },
      );
      if (!validated) continue;

      if (i === 0) {
        primaryRouteM = validated.route.distance;
        primaryValidated = validated;
        // If Google already supplied the online primary, OSRM's direct route is the
        // offline backup path; otherwise OSRM IS the primary.
        if (hasGooglePrimary) {
          pushValidated(
            validated,
            "traffic",
            "OSM route (offline)",
            "Free-flow OSM driving route — used offline or if Google is unavailable",
            [],
          );
        } else {
          pushValidated(
            validated,
            "standard",
            "Primary (fastest)",
            ROUTE_SCENARIO_META.standard.description,
            [],
          );
        }
      } else {
        pushValidated(
          validated,
          "traffic",
          `OSM alternate ${i}`,
          `Different OSM path — up to ${Math.round(MAX_ROUTE_EXTRA_M / 1000)} km longer on short legs`,
          [],
        );
      }
    }
  }

  if (primaryRouteM == null) {
    const fallbackData = await requestOsrm([origin, destination], false);
    const validated = validateOsrmRoute(fallbackData, [origin, destination], {});
    if (validated) {
      primaryRouteM = validated.route.distance;
      primaryValidated = validated;
      pushValidated(
        validated,
        hasGooglePrimary ? "traffic" : "standard",
        hasGooglePrimary ? "OSM route (offline)" : "Primary (fastest)",
        hasGooglePrimary
          ? "Free-flow OSM driving route — used offline or if Google is unavailable"
          : ROUTE_SCENARIO_META.standard.description,
        [],
      );
    }
  }

  if (primaryValidated && primaryRouteM != null && variants.length < 3) {
    await generateCorridorAlternates(
      origin,
      destination,
      primaryValidated,
      primaryRouteM,
      pushValidated,
    );
  }

  if (primaryRouteM != null && input.avoidPolygon && input.avoidPolygon.length >= 3) {
    const rawBypass = computeBypassVia(origin, destination, input.avoidPolygon, 1.2);
    if (rawBypass) {
      const snappedBypass = await snapToRoad(rawBypass);
      if (
        snappedBypass &&
        distanceMeters(rawBypass.lng, rawBypass.lat, snappedBypass.lng, snappedBypass.lat) <=
          MAX_SNAP_VIA_M
      ) {
        const bypassData = await requestOsrm([origin, snappedBypass, destination], false, {
          viaRadiusM: 5_000,
        });
        const validated = validateOsrmRoute(bypassData, [origin, snappedBypass, destination], {
          primaryRouteM,
        });
        if (validated) {
          pushValidated(
            validated,
            "riot",
            "Hazard bypass",
            ROUTE_SCENARIO_META.riot.description,
            [snappedBypass],
          );
        }
      }
    }
  }

  if (primaryRouteM != null) {
    for (let i = 0; i < manualVia.length; i++) {
      const slice = manualVia.slice(0, i + 1);
      const snappedVias: RouteWaypoint[] = [];
      let ok = true;
      for (const v of slice) {
        const s = await snapToRoad(v);
        if (!s) {
          ok = false;
          break;
        }
        snappedVias.push(s);
      }
      if (!ok) continue;

      const viaData = await requestOsrm([origin, ...snappedVias, destination], false, {
        viaRadiusM: 5_000,
      });
      const validated = validateOsrmRoute(viaData, [origin, ...snappedVias, destination], {
        primaryRouteM,
      });
      if (validated) {
        pushValidated(
          validated,
          "diversion",
          `Manual via ${i + 1}`,
          ROUTE_SCENARIO_META.diversion.description,
          snappedVias,
        );
      }
    }
  }

  // Primary (standard) first — even if its live-traffic ETA is slower than a
  // free-flow alternate — then the rest fastest-first.
  return variants.sort((a, b) => {
    if (a.scenario === "standard" && b.scenario !== "standard") return -1;
    if (b.scenario === "standard" && a.scenario !== "standard") return 1;
    return a.durationSeconds - b.durationSeconds;
  });
}
