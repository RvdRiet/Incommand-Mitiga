import type { Feature, FeatureCollection, Point } from "geojson";

import type {
  DamageRecord,
  FieldUnit,
  GeoLocated,
  Personnel,
  ResourceRequest,
  RoadDamage,
  Shelter,
} from "@/lib/incident/types";

/** The operational record types that can be plotted on the Common Operating Picture. */
export type CopLayerKey = "units" | "personnel" | "shelters" | "damage" | "road" | "resources";

export type CopLayerDef = {
  key: CopLayerKey;
  label: string;
  /** Marker colour for this layer. */
  color: string;
};

export const COP_LAYERS: CopLayerDef[] = [
  { key: "units", label: "Field Units (live)", color: "#16a34a" },
  { key: "personnel", label: "Personnel", color: "#2563eb" },
  { key: "shelters", label: "Shelters", color: "#7c3aed" },
  { key: "damage", label: "Damage Assessment", color: "#dc2626" },
  { key: "road", label: "Road Damages", color: "#d97706" },
  { key: "resources", label: "Resource Requests", color: "#0d9488" },
];

export type CopData = {
  fieldUnits: FieldUnit[];
  personnel: Personnel[];
  shelters: Shelter[];
  damages: DamageRecord[];
  roadDamages: RoadDamage[];
  resourceRequests: ResourceRequest[];
  /** Field-unit ids whose bodycam is offline — plotted greyed out, not the live colour. */
  offlineUnitIds?: Set<string>;
};

/** Muted grey for an offline bodycam's marker (so it reads as "not reachable"). */
export const OFFLINE_UNIT_COLOR = "#94a3b8";

export function hasCoords<T extends GeoLocated>(r: T): r is T & { lat: number; lng: number } {
  return typeof r.lat === "number" && typeof r.lng === "number";
}

type Row = { lat: number; lng: number; label: string; color?: string };
type LayerRows = { color: string; rows: Row[] };

function rowsFor(key: CopLayerKey, data: CopData): LayerRows {
  const def = COP_LAYERS.find((l) => l.key === key)!;
  const collect = <T extends GeoLocated>(items: T[], labelOf: (t: T) => string): Row[] =>
    items.filter(hasCoords).map((t) => ({ lat: t.lat, lng: t.lng, label: labelOf(t) }));

  switch (key) {
    case "units": {
      const offline = data.offlineUnitIds;
      const rows: Row[] = data.fieldUnits.filter(hasCoords).map((u) => {
        const isOffline = offline?.has(u.id) ?? false;
        return {
          lat: u.lat,
          lng: u.lng,
          label: isOffline ? `${u.callsign} (offline)` : u.callsign,
          color: isOffline ? OFFLINE_UNIT_COLOR : undefined,
        };
      });
      return { color: def.color, rows };
    }
    case "personnel":
      return { color: def.color, rows: collect(data.personnel, (p) => p.name) };
    case "shelters":
      return { color: def.color, rows: collect(data.shelters, (s) => s.name) };
    case "damage":
      return { color: def.color, rows: collect(data.damages, (d) => d.name) };
    case "road":
      return { color: def.color, rows: collect(data.roadDamages, (r) => r.roadName) };
    case "resources":
      return { color: def.color, rows: collect(data.resourceRequests, (r) => r.resource) };
  }
}

/** Number of geolocated records available per layer (for the layer toggles). */
export function copCounts(data: CopData): Record<CopLayerKey, number> {
  return COP_LAYERS.reduce(
    (acc, l) => {
      acc[l.key] = rowsFor(l.key, data).rows.length;
      return acc;
    },
    {} as Record<CopLayerKey, number>,
  );
}

/** Build a GeoJSON point layer for the enabled COP layers. */
export function buildCopFeatures(data: CopData, enabled: Set<CopLayerKey>): FeatureCollection {
  const features: Feature<Point>[] = [];
  for (const layer of COP_LAYERS) {
    if (!enabled.has(layer.key)) continue;
    const { color, rows } = rowsFor(layer.key, data);
    for (const row of rows) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [row.lng, row.lat] },
        properties: {
          kind: "cop",
          copLayer: layer.key,
          markerColor: row.color ?? color,
          offline: row.color != null,
          label: row.label,
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
