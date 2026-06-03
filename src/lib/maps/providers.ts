import type { Feature, LineString, Position } from "geojson";
import type { StyleSpecification } from "maplibre-gl";

import { defaultOsmRasterStyle } from "./osm-style";

export type LngLat = { lng: number; lat: number };

export type DirectionsRequest = {
  origin: LngLat;
  destination: LngLat;
  /** driving | walking — provider-specific mapping */
  profile?: "driving" | "walking";
};

export type DirectionsResult = {
  distanceMeters: number;
  durationSeconds: number;
  route: Feature<LineString>;
};

export type TrafficSummary = {
  summary: string;
  /** 0 calm — 3 severe congestion (qualitative) */
  congestionIndex: number;
  provider: string;
  asOf: string;
};

export interface BasemapProvider {
  id: string;
  getStyle(): StyleSpecification;
  attributionHtml(): string;
}

export interface RoutingProvider {
  id: string;
  getDirections(req: DirectionsRequest): Promise<DirectionsResult | null>;
}

export interface TrafficSummaryProvider {
  id: string;
  getSummaryForViewport(bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  }): Promise<TrafficSummary | null>;
}

export class OpenStreetMapRasterProvider implements BasemapProvider {
  id = "osm_raster";

  constructor(private readonly tileUrl: string) {}

  getStyle(): StyleSpecification {
    return defaultOsmRasterStyle(this.tileUrl);
  }

  attributionHtml(): string {
    return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  }
}

export class NoopRoutingProvider implements RoutingProvider {
  id = "noop";

  async getDirections(): Promise<DirectionsResult | null> {
    return null;
  }
}

/** Server-side Google Directions (legacy REST) — minimal MVP; prefer Routes API v2 in production */
export class GoogleRoutesProvider implements RoutingProvider {
  id = "google_directions";

  constructor(private readonly apiKey: string) {}

  async getDirections(req: DirectionsRequest): Promise<DirectionsResult | null> {
    const mode = req.profile === "walking" ? "walking" : "driving";
    const origin = `${req.origin.lat},${req.origin.lng}`;
    const dest = `${req.destination.lat},${req.destination.lng}`;
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", dest);
    url.searchParams.set("mode", mode);
    url.searchParams.set("key", this.apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: {
        legs: { distance: { value: number }; duration: { value: number } }[];
        overview_polyline: { points: string };
      }[];
    };
    const route = data.routes?.[0];
    if (!route) return null;

    const poly = decodePolyline(route.overview_polyline.points);
    const legs = route.legs ?? [];
    const distanceMeters = legs.reduce((a, l) => a + l.distance.value, 0);
    const durationSeconds = legs.reduce((a, l) => a + l.duration.value, 0);

    return {
      distanceMeters,
      durationSeconds,
      route: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: poly,
        },
      },
    };
  }
}

export class HeuristicTrafficProvider implements TrafficSummaryProvider {
  id = "heuristic";

  async getSummaryForViewport(): Promise<TrafficSummary | null> {
    return {
      summary:
        "Traffic detail requires a configured provider. Enable Google or another traffic API in staging.",
      congestionIndex: 0,
      provider: "none",
      asOf: new Date().toISOString(),
    };
  }
}

export function createMapStackFromEnv(): {
  basemap: BasemapProvider;
  routing: RoutingProvider;
  traffic: TrafficSummaryProvider;
} {
  const tileUrl =
    process.env.NEXT_PUBLIC_OSM_TILE_URL ??
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  // Same default as basemap-theme.ts (OpenStreetMap raster, zoom 19 tiles)

  const basemap = new OpenStreetMapRasterProvider(tileUrl);

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const routing = googleKey
    ? new GoogleRoutesProvider(googleKey)
    : new NoopRoutingProvider();

  const traffic = new HeuristicTrafficProvider();

  return { basemap, routing, traffic };
}

/** Encoded polyline algorithm (Google) */
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
