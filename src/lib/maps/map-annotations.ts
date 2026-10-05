import type { FeatureCollection } from "geojson";

import type { MapAnnotation } from "@/lib/incident/types";

import { mergeFeatureCollections } from "./geo-utils";

/**
 * Distinct, map-legible colours for drawn shapes so overlapping polygons/zones can
 * be told apart at a glance. Assigned on create (see nextAnnotationColor) and
 * changeable per shape from the map's Layers panel.
 */
export const ANNOTATION_COLORS = [
  "#e11d48", // red
  "#2563eb", // blue
  "#f59e0b", // amber
  "#16a34a", // green
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // pink
  "#0d9488", // teal
] as const;

export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0];

/** Pick a colour not already in use; once all are taken, cycle by count. */
export function nextAnnotationColor(existing: MapAnnotation[]): string {
  const used = new Set(existing.map((a) => a.color).filter(Boolean));
  const free = ANNOTATION_COLORS.find((c) => !used.has(c));
  return free ?? ANNOTATION_COLORS[existing.length % ANNOTATION_COLORS.length];
}

export function annotationsToFeatureCollection(
  annotations: MapAnnotation[],
): FeatureCollection {
  return mergeFeatureCollections(
    ...annotations.map((a) => ({
      type: "FeatureCollection" as const,
      features: a.geojson.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          annotationId: a.id,
          annotationKind: a.kind,
          annotationName: a.name,
          // The annotation's colour drives every layer that renders it (fill, line,
          // marker). Overrides any colour baked into the stored geometry.
          ...(a.color
            ? { fillColor: a.color, strokeColor: a.color, markerColor: a.color }
            : {}),
        },
      })),
    })),
  );
}
