import type { LineString, Position } from "geojson";

import { distanceMeters } from "./geo-utils";
import type { RouteWaypoint } from "./routing-types";

/** Long-distance alternates may be up to this much longer than the primary (meters). */
export const MAX_ROUTE_EXTRA_M = 30_000;

/** Minimum extra length for an alternate to count as a distinct corridor (meters). */
export const MIN_ROUTE_EXTRA_M = 3_000;


/** Reject geometry segments longer than this (likely off-road chord). */
const MAX_SEGMENT_M = 2_500;

/** Polyline length must be close to OSRM driving distance along roads. */
const MIN_PATH_TO_DISTANCE = 0.85;
const MAX_PATH_TO_DISTANCE = 1.15;

type OsrmStep = { geometry?: LineString; distance?: number };
type OsrmLeg = { steps?: OsrmStep[]; distance?: number };
export type OsrmRouteWithLegs = {
  distance: number;
  duration: number;
  geometry: LineString;
  legs?: OsrmLeg[];
};

export function pathLengthMeters(coordinates: Position[]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    if (a[0] == null || a[1] == null || b[0] == null || b[1] == null) continue;
    total += distanceMeters(a[0], a[1], b[0], b[1]);
  }
  return total;
}

export function maxSegmentMeters(coordinates: Position[]): number {
  let max = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1]!;
    const b = coordinates[i]!;
    if (a[0] == null || a[1] == null || b[0] == null || b[1] == null) continue;
    max = Math.max(max, distanceMeters(a[0], a[1], b[0], b[1]));
  }
  return max;
}

function appendCoords(target: Position[], incoming: Position[]) {
  for (let i = 0; i < incoming.length; i++) {
    const c = incoming[i]!;
    if (c[0] == null || c[1] == null) continue;
    const prev = target[target.length - 1];
    if (prev && prev[0] === c[0] && prev[1] === c[1]) continue;
    target.push(c);
  }
}

/** Merge per-step road geometries (denser, follows carriageways). */
export function drivingGeometryFromRoute(route: OsrmRouteWithLegs): LineString {
  const merged: Position[] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      if (step.geometry?.coordinates?.length) {
        appendCoords(merged, step.geometry.coordinates);
      }
    }
  }
  if (merged.length >= 2) {
    return { type: "LineString", coordinates: merged };
  }
  return route.geometry;
}

export function validateDrivingGeometry(
  geometry: LineString,
  osrmDistanceM: number,
  relaxed = false,
): { ok: true } | { ok: false; reason: string } {
  const coords = geometry.coordinates;
  if (coords.length < 2) {
    return { ok: false, reason: "too_few_points" };
  }

  const maxSeg = maxSegmentMeters(coords);
  const maxAllowedSeg = relaxed ? 8_000 : MAX_SEGMENT_M;
  if (maxSeg > maxAllowedSeg) {
    return { ok: false, reason: "segment_gap" };
  }

  const pathM = pathLengthMeters(coords);
  if (pathM < osrmDistanceM * MIN_PATH_TO_DISTANCE) {
    return { ok: false, reason: "shortcut" };
  }
  if (pathM > osrmDistanceM * MAX_PATH_TO_DISTANCE) {
    return { ok: false, reason: "path_mismatch" };
  }

  return { ok: true };
}

/** Allowed extra length scales with trip (10–30 km typical; more on very long hauls). */
export function maxAllowedRouteMeters(primaryRouteM: number): number {
  const extra = Math.min(80_000, Math.max(MAX_ROUTE_EXTRA_M, primaryRouteM * 0.12));
  return primaryRouteM + extra;
}

/** Lateral offset for corridor alternates (meters). */
export function corridorOffsetMeters(routeDistanceM: number): number {
  return Math.min(22_000, Math.max(4_000, routeDistanceM * 0.018));
}

function interpolate(
  a: Position,
  b: Position,
  t: number,
): [number, number] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t];
}

/** Point at a fraction of distance along a route polyline. */
export function pointAlongRoute(
  geometry: LineString,
  fraction: number,
): { lng: number; lat: number; bearingDeg: number } | null {
  const coords = geometry.coordinates;
  if (coords.length < 2) return null;

  const total = pathLengthMeters(coords);
  if (total <= 0) return null;

  const target = total * Math.min(0.92, Math.max(0.08, fraction));
  let walked = 0;

  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const seg = distanceMeters(a[0]!, a[1]!, b[0]!, b[1]!);
    if (walked + seg >= target) {
      const t = seg > 0 ? (target - walked) / seg : 0;
      const [lng, lat] = interpolate(a, b, t);
      const bearingDeg = bearingDegrees(a[1]!, a[0]!, b[1]!, b[0]!);
      return { lng, lat, bearingDeg };
    }
    walked += seg;
  }

  const last = coords[coords.length - 1]!;
  const prev = coords[coords.length - 2]!;
  return {
    lng: last[0]!,
    lat: last[1]!,
    bearingDeg: bearingDegrees(prev[1]!, prev[0]!, last[1]!, last[0]!),
  };
}

function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Perpendicular corridor point left (negative) or right (positive) of the primary route. */
export function corridorViaFromRoute(
  geometry: LineString,
  fraction: number,
  side: -1 | 1,
  offsetM: number,
  label: string,
): RouteWaypoint | null {
  const anchor = pointAlongRoute(geometry, fraction);
  if (!anchor) return null;

  const brg = (anchor.bearingDeg * Math.PI) / 180;
  const perp = brg + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
  const latRad = (anchor.lat * Math.PI) / 180;
  const dLat = ((offsetM / 111_320) * Math.cos(perp));
  const dLng = ((offsetM / (111_320 * Math.cos(latRad))) * Math.sin(perp));

  return {
    lng: anchor.lng + dLng,
    lat: anchor.lat + dLat,
    label,
  };
}


export function isMeaningfulAlternate(primaryRouteM: number, alternateRouteM: number): boolean {
  const extra = alternateRouteM - primaryRouteM;
  return extra >= MIN_ROUTE_EXTRA_M && extra <= MAX_ROUTE_EXTRA_M;
}
