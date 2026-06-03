/**
 * PostGIS geometry helpers — use with migrations/0001_initial.sql tables
 * `planning_areas`, `affected_zones`, `routes`.
 */
import { sql } from "drizzle-orm";
import type { GeoJSON } from "geojson";

export function multiPolygonFromGeoJSON(geojson: GeoJSON) {
  const raw = JSON.stringify(geojson);
  return sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${raw}), 4326))::geometry(MultiPolygon,4326)`;
}

export function multiLineStringFromGeoJSON(geojson: GeoJSON) {
  const raw = JSON.stringify(geojson);
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${raw}), 4326)::geometry(MultiLineString,4326)`;
}

export function geographyPointFromLngLat(lng: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}
