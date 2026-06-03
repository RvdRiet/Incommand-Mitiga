import type { Feature, FeatureCollection, LineString } from "geojson";

import type { RouteVariant } from "./routing-types";
import type { SupplyRoute } from "./routing-types";

/** Distinct colors so every alternative is visible on the map at once. */
export const ROUTE_ALT_COLORS = [
  "#0284c7",
  "#d97706",
  "#0d9488",
  "#7c3aed",
  "#e11d48",
  "#65a30d",
  "#0891b2",
  "#c026d3",
  "#ea580c",
  "#4f46e5",
] as const;

const SCENARIO_COLOR: Record<string, string> = {
  standard: "#0284c7",
  traffic: "#d97706",
  riot: "#e11d48",
  emergency: "#b91c1c",
  diversion: "#0d9488",
};

type VariantLike = {
  id: string;
  scenario: string;
  label?: string;
  geojson: Feature<LineString>;
  intersectsHazard?: boolean;
};

function variantToLineFeature(
  variant: VariantLike,
  index: number,
  previewVariantId: string | null | undefined,
  extra?: Record<string, unknown>,
): Feature<LineString> {
  const hasFocus = previewVariantId != null;
  const highlighted = hasFocus && variant.id === previewVariantId;
  const color =
    ROUTE_ALT_COLORS[index % ROUTE_ALT_COLORS.length] ??
    SCENARIO_COLOR[variant.scenario] ??
    "#0284c7";

  return {
    type: "Feature",
    properties: {
      variantId: variant.id,
      scenario: variant.scenario,
      variantLabel: variant.label ?? variant.scenario,
      strokeColor: variant.intersectsHazard ? "#dc2626" : color,
      lineWidth: highlighted ? 9 : hasFocus ? 3 : 5,
      lineOpacity: highlighted ? 1 : hasFocus ? 0.28 : 0.88,
      lineDasharray: variant.intersectsHazard ? [2, 1.5] : [1, 0],
      selected: highlighted,
      intersectsHazard: Boolean(variant.intersectsHazard),
      routeColor: color,
      ...extra,
    },
    geometry: variant.geojson.geometry,
  };
}

export function routesToFeatureCollection(
  routes: SupplyRoute[],
  options?: {
    draftVariants?: VariantLike[];
    previewVariantId?: string | null;
    showAllSavedVariants?: boolean;
  },
): FeatureCollection {
  const features: Feature<LineString>[] = [];

  if (options?.draftVariants?.length) {
    options.draftVariants.forEach((variant, index) => {
      features.push(variantToLineFeature(variant, index, options.previewVariantId));
    });
    return { type: "FeatureCollection", features };
  }

  for (const route of routes) {
    const showAll = options?.showAllSavedVariants ?? false;
    route.variants.forEach((variant, index) => {
      if (!showAll && route.selectedVariantId && variant.id !== route.selectedVariantId) {
        return;
      }
      features.push(
        variantToLineFeature(variant, index, route.selectedVariantId, {
          routeId: route.id,
          routeName: route.name,
        }),
      );
    });
  }

  return { type: "FeatureCollection", features };
}

export function enrichVariantsWithHazards(
  variants: RouteVariant[],
  check: (geometry: LineString) => { intersects: boolean; hits: string[] },
): (RouteVariant & { intersectsHazard?: boolean; hazardHits?: string[] })[] {
  return variants.map((v) => {
    const { intersects, hits } = check(v.geojson.geometry);
    return { ...v, intersectsHazard: intersects, hazardHits: hits };
  });
}

export function waypointMarkersCollection(
  origin: { lat: number; lng: number; label?: string } | null,
  destination: { lat: number; lng: number; label?: string } | null,
  via: { lat: number; lng: number; label?: string }[],
): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  if (origin) {
    features.push({
      type: "Feature",
      properties: { kind: "route-origin", label: origin.label ?? "Start" },
      geometry: { type: "Point", coordinates: [origin.lng, origin.lat] },
    });
  }
  if (destination) {
    features.push({
      type: "Feature",
      properties: { kind: "route-destination", label: destination.label ?? "End" },
      geometry: { type: "Point", coordinates: [destination.lng, destination.lat] },
    });
  }
  via.forEach((p, i) => {
    features.push({
      type: "Feature",
      properties: { kind: "route-via", label: p.label ?? `Via ${i + 1}` },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    });
  });
  return { type: "FeatureCollection", features };
}

export function boundsForVariants(
  variants: { geojson: Feature<LineString> }[],
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const v of variants) {
    for (const [lng, lat] of v.geojson.geometry.coordinates) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
