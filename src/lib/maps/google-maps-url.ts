import type { RouteWaypoint } from "./routing-types";

/** Google Maps turn-by-turn directions link for drivers. */
export function buildGoogleMapsDirectionsUrl(
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  viaPoints: RouteWaypoint[] = [],
): string {
  const fmt = (w: RouteWaypoint) => `${w.lat},${w.lng}`;
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(origin),
    destination: fmt(destination),
    travelmode: "driving",
  });
  const via = viaPoints.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (via.length > 0) {
    params.set("waypoints", via.map(fmt).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
