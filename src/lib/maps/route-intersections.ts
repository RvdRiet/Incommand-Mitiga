import type { Feature, LineString, Position } from "geojson";

import { distanceMeters } from "./geo-utils";
import type { MapAnnotation } from "@/lib/incident/types";

function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function sampleLineCoords(coords: Position[], spacingM = 120): Position[] {
  if (coords.length < 2) return coords;
  const samples: Position[] = [coords[0]!];
  for (let i = 1; i < coords.length; i++) {
    const [lng0, lat0] = coords[i - 1]!;
    const [lng1, lat1] = coords[i]!;
    const segM = distanceMeters(lng0, lat0, lng1, lat1);
    const steps = Math.max(1, Math.ceil(segM / spacingM));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      samples.push([lng0 + (lng1 - lng0) * t, lat0 + (lat1 - lat0) * t]);
    }
  }
  return samples;
}

function annotationRings(ann: MapAnnotation): Position[][] {
  const rings: Position[][] = [];
  for (const f of ann.geojson.features) {
    if (f.geometry?.type === "Polygon") {
      rings.push(f.geometry.coordinates[0] as Position[]);
    }
  }
  return rings;
}

/** True if any sampled point along the route falls inside a polygon/circle annotation. */
export function routeIntersectsAnnotations(
  geometry: LineString,
  annotations: MapAnnotation[],
): { intersects: boolean; hits: string[] } {
  const hazards = annotations.filter((a) => a.kind === "polygon" || a.kind === "circle");
  if (hazards.length === 0) return { intersects: false, hits: [] };

  const samples = sampleLineCoords(geometry.coordinates);
  const hits = new Set<string>();

  for (const ann of hazards) {
    const rings = annotationRings(ann);
    for (const ring of rings) {
      if (ring.length < 3) continue;
      for (const [lng, lat] of samples) {
        if (pointInRing(lng, lat, ring)) {
          hits.add(ann.name);
          break;
        }
      }
    }
  }

  return { intersects: hits.size > 0, hits: [...hits] };
}
