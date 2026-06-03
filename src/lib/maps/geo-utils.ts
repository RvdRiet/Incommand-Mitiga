import type { Feature, FeatureCollection, Polygon, Position } from "geojson";

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters between two WGS84 points. */
export function distanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Approximate circle as a GeoJSON polygon (WGS84). */
export function circlePolygon(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  steps = 64,
): Polygon {
  const coords: Position[] = [];
  const latRad = (centerLat * Math.PI) / 180;
  const lngRad = (centerLng * Math.PI) / 180;
  const angular = radiusMeters / EARTH_RADIUS_M;

  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2),
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return { type: "Polygon", coordinates: [coords] };
}

export function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function polygonFeature(
  ring: Position[],
  properties: Record<string, unknown> = {},
): Feature<Polygon> {
  const closed =
    ring.length > 0 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring
      : [...ring, ring[0]!];
  return {
    type: "Feature",
    properties,
    geometry: { type: "Polygon", coordinates: [closed] },
  };
}

export function circleFeatureCollection(
  centerLng: number,
  centerLat: number,
  radiusMeters: number,
  properties: Record<string, unknown> = {},
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ...properties, radiusMeters },
        geometry: circlePolygon(centerLng, centerLat, radiusMeters),
      },
    ],
  };
}

export function mergeFeatureCollections(
  ...collections: FeatureCollection[]
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((c) => c.features),
  };
}
