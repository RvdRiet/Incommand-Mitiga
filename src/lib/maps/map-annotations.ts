import type { FeatureCollection } from "geojson";

import type { MapAnnotation } from "@/lib/incident/types";

import { mergeFeatureCollections } from "./geo-utils";

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
        },
      })),
    })),
  );
}
