import type { Position } from "geojson";

import { newId } from "@/lib/incident/id";

import { buildGoogleMapsDirectionsUrl } from "./google-maps-url";
import type { RouteVariant, RouteWaypoint } from "./routing-types";

/**
 * Google Directions as the MAIN ONLINE routing engine — its edge over OSRM is
 * live, traffic-aware ETAs (departure_time=now → duration_in_traffic), which OSRM
 * fundamentally cannot provide. Used as the primary "standard" variant when
 * GOOGLE_MAPS_API_KEY is set AND the call succeeds; the OSRM engine remains the
 * offline/no-key fallback and the source of scenario alternates.
 *
 * ⚠️ Licensing: Google's ToS restricts persisting Directions geometry. Saved
 * routes are tagged provider:"google" so the app can, if needed, choose to store
 * only the OSRM reference. Confirm your Google Maps license permits caching before
 * persisting Google geometry at scale.
 */

function googleKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined;
}

/** Decode a Google encoded polyline into [lng,lat] positions. */
function decodePolyline(encoded: string): Position[] {
  const coordinates: Position[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }
  return coordinates;
}

type GoogleDirectionsResponse = {
  status?: string;
  routes?: {
    legs?: {
      distance?: { value?: number };
      duration?: { value?: number };
      duration_in_traffic?: { value?: number };
    }[];
    overview_polyline?: { points?: string };
  }[];
};

/**
 * Compute the primary traffic-aware driving route via Google Directions.
 * Returns a ready RouteVariant, or null if unkeyed / offline / no route.
 */
export async function planGooglePrimaryVariant(
  origin: RouteWaypoint,
  destination: RouteWaypoint,
  viaPoints: RouteWaypoint[] = [],
): Promise<RouteVariant | null> {
  const key = googleKey();
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("departure_time", "now"); // unlocks duration_in_traffic
  url.searchParams.set("traffic_model", "best_guess");
  if (viaPoints.length > 0) {
    url.searchParams.set(
      "waypoints",
      viaPoints.map((v) => `${v.lat},${v.lng}`).join("|"),
    );
  }
  url.searchParams.set("key", key);

  let data: GoogleDirectionsResponse;
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;
    data = (await res.json()) as GoogleDirectionsResponse;
  } catch {
    return null;
  }
  if (data.status && data.status !== "OK") return null;

  const route = data.routes?.[0];
  const legs = route?.legs ?? [];
  const points = route?.overview_polyline?.points;
  if (!route || legs.length === 0 || !points) return null;

  const coordinates = decodePolyline(points);
  if (coordinates.length < 2) return null;

  const distanceMeters = legs.reduce((a, l) => a + (l.distance?.value ?? 0), 0);
  // Prefer live-traffic duration; fall back to free-flow if unavailable.
  const trafficAware = legs.some((l) => l.duration_in_traffic?.value != null);
  const durationSeconds = legs.reduce(
    (a, l) => a + (l.duration_in_traffic?.value ?? l.duration?.value ?? 0),
    0,
  );

  return {
    id: `standard-${newId()}`,
    scenario: "standard",
    label: trafficAware ? "Primary (live traffic)" : "Primary (Google)",
    description: trafficAware
      ? "Fastest Google route with current traffic — recomputes live online"
      : "Fastest Google driving route",
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(durationSeconds),
    geojson: {
      type: "Feature",
      properties: { scenario: "standard", provider: "google" },
      geometry: { type: "LineString", coordinates },
    },
    googleMapsUrl: buildGoogleMapsDirectionsUrl(origin, destination, viaPoints),
    waypoints: [origin, ...viaPoints, destination],
    provider: "google",
    trafficAware,
  };
}
