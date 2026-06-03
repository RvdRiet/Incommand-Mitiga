import { distanceMeters } from "./geo-utils";
import { buildGoogleMapsDirectionsUrl } from "./google-maps-url";
import { pathLengthMeters, validateDrivingGeometry } from "./route-geometry";
import type { RouteVariant, RouteWaypoint } from "./routing-types";

const OSRM_BASE =
  process.env.OSRM_BASE_URL?.replace(/\/$/, "") ??
  "https://router.project-osrm.org";

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
};

/** Independent OSRM request (no app validation) for cross-check. */
export async function fetchOsrmReferenceRoute(
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  viaPoints: RouteWaypoint[] = [],
): Promise<OsrmRoute | null> {
  const points = [origin, ...viaPoints, destination];
  const path = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url =
    `${OSRM_BASE}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`;

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    code?: string;
    routes?: OsrmRoute[];
  };
  if (data.code !== "Ok" || !data.routes?.[0]) return null;
  return data.routes[0];
}

export type RouteVerificationRow = {
  label: string;
  appDistanceKm: number;
  appDurationMin: number;
  polylineKm: number;
  osrmReferenceKm: number | null;
  osrmReferenceMin: number | null;
  distanceVsOsrmPct: number | null;
  geometryOk: boolean;
  geometryIssue?: string;
  straightLineKm: number;
  googleMapsUrl: string;
};

export async function verifyVariant(
  variant: RouteVariant,
  origin: RouteWaypoint,
  destination: RouteWaypoint,
): Promise<RouteVerificationRow> {
  const vias = variant.waypoints.slice(1, -1);
  const geom = variant.geojson.geometry;
  const polylineM = pathLengthMeters(geom.coordinates);
  const roadCheck = validateDrivingGeometry(geom, variant.distanceMeters, true);

  const ref = await fetchOsrmReferenceRoute(origin, destination, vias);
  const refKm = ref ? ref.distance / 1000 : null;
  const appKm = variant.distanceMeters / 1000;
  const distanceVsOsrmPct =
    refKm != null && refKm > 0 ? Math.round(((appKm - refKm) / refKm) * 1000) / 10 : null;

  const straightM = distanceMeters(origin.lng, origin.lat, destination.lng, destination.lat);

  return {
    label: variant.label,
    appDistanceKm: Math.round(appKm * 10) / 10,
    appDurationMin: Math.round(variant.durationSeconds / 60),
    polylineKm: Math.round((polylineM / 1000) * 10) / 10,
    osrmReferenceKm: refKm != null ? Math.round(refKm * 10) / 10 : null,
    osrmReferenceMin: ref ? Math.round(ref.duration / 60) : null,
    distanceVsOsrmPct,
    geometryOk: roadCheck.ok,
    geometryIssue: roadCheck.ok ? undefined : roadCheck.reason,
    straightLineKm: Math.round((straightM / 1000) * 10) / 10,
    googleMapsUrl: variant.googleMapsUrl || buildGoogleMapsDirectionsUrl(origin, destination, vias),
  };
}

export async function verifyAllVariants(
  variants: RouteVariant[],
  origin: RouteWaypoint,
  destination: RouteWaypoint,
): Promise<RouteVerificationRow[]> {
  const rows: RouteVerificationRow[] = [];
  for (const v of variants) {
    rows.push(await verifyVariant(v, origin, destination));
  }
  return rows;
}

export function formatVerificationReport(
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  rows: RouteVerificationRow[],
): string {
  const lines: string[] = [
    "Route verification (OSM/OSRM — no API keys)",
    `Origin: ${origin.label || `${origin.lat}, ${origin.lng}`}`,
    `Destination: ${destination.label || `${destination.lat}, ${destination.lng}`}`,
    "",
    "Compare each Google Maps link manually (Google has no free driving API for scripts).",
    "App routes should match OSRM reference within ~2% distance when waypoints align.",
    "",
  ];

  for (const r of rows) {
    lines.push(`--- ${r.label} ---`);
    lines.push(`  App:        ${r.appDistanceKm} km, ${r.appDurationMin} min`);
    lines.push(`  Polyline:   ${r.polylineKm} km (drawn path)`);
    lines.push(`  OSRM check: ${r.osrmReferenceKm ?? "n/a"} km, ${r.osrmReferenceMin ?? "n/a"} min`);
    if (r.distanceVsOsrmPct != null) {
      lines.push(`  vs OSRM:    ${r.distanceVsOsrmPct >= 0 ? "+" : ""}${r.distanceVsOsrmPct}%`);
    }
    lines.push(`  Straight:   ${r.straightLineKm} km (not drivable)`);
    lines.push(`  Geometry:   ${r.geometryOk ? "OK (on-road)" : `FAIL (${r.geometryIssue})`}`);
    lines.push(`  Google Maps: ${r.googleMapsUrl}`);
    lines.push("");
  }

  return lines.join("\n");
}
