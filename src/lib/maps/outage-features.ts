import type { Feature, FeatureCollection } from "geojson";

import type { OutageRecord, OutageType } from "@/lib/incident/types";

export const OUTAGE_TYPES: { key: OutageType; label: string; color: string }[] = [
  { key: "electricity", label: "Electricity", color: "#d97706" },
  { key: "water", label: "Water", color: "#2563eb" },
];

const RESOLVED_COLOR = "#9ca3af";

export function outageColor(o: Pick<OutageRecord, "type" | "status">): string {
  if (o.status === "resolved") return RESOLVED_COLOR;
  return OUTAGE_TYPES.find((t) => t.key === o.type)?.color ?? "#6b7280";
}

/** Approximate distance in metres between two lat/lng points (equirectangular — fine at city scale). */
export function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const latRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
  const dLat = (lat2 - lat1) * 111_320;
  const dLng = (lng2 - lng1) * 111_320 * Math.cos(latRad);
  return Math.hypot(dLat, dLng);
}

/** Approximate a circle of `radiusM` metres around a point as a closed polygon ring. */
export function circleRing(
  lat: number,
  lng: number,
  radiusM: number,
  steps = 48,
): [number, number][] {
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(Math.cos(latRad), 1e-6));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

/** Build the GeoJSON for the enabled outage layers: a shaded affected-area circle + centre dot each. */
export function outagesToFeatures(
  outages: OutageRecord[],
  enabled: Set<OutageType>,
  selectedId?: string | null,
): FeatureCollection {
  const features: Feature[] = [];
  for (const o of outages) {
    if (!enabled.has(o.type)) continue;
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) continue;
    const color = outageColor(o);
    const selected = o.id === selectedId;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circleRing(o.lat, o.lng, o.radiusM)] },
      properties: {
        outageId: o.id,
        fillColor: color,
        strokeColor: color,
        lineWidth: selected ? 3.5 : 1.75,
        lineOpacity: selected ? 1 : 0.8,
      },
    });
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [o.lng, o.lat] },
      properties: {
        kind: "cop",
        outageId: o.id,
        markerColor: color,
        label: o.title,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
