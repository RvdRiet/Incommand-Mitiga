import type { ResidentArea, Resident } from "./types";

export type ResidentAreaSortMode =
  | "city_asc"
  | "city_desc"
  | "census_desc"
  | "affected_desc"
  | "tracked_desc";

export function residentCityKey(row: ResidentArea): string {
  return row.city.trim() || row.municipality.trim() || "Unassigned";
}

export function sortResidentAreas(
  rows: ResidentArea[],
  mode: ResidentAreaSortMode,
): ResidentArea[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (mode) {
      case "city_asc":
        return residentCityKey(a).localeCompare(residentCityKey(b), "en", {
          sensitivity: "base",
        });
      case "city_desc":
        return residentCityKey(b).localeCompare(residentCityKey(a), "en", {
          sensitivity: "base",
        });
      case "census_desc":
        return b.censusPopulation - a.censusPopulation;
      case "affected_desc":
        return b.estimatedAffected - a.estimatedAffected;
      case "tracked_desc":
        return b.trackedResidents - a.trackedResidents;
      default:
        return 0;
    }
  });
  return copy;
}

export function countResidentsByCity(
  areas: ResidentArea[],
  individuals: Resident[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const area of areas) {
    map.set(area.id, 0);
  }
  for (const r of individuals) {
    if (r.residentAreaId && map.has(r.residentAreaId)) {
      map.set(r.residentAreaId, (map.get(r.residentAreaId) ?? 0) + 1);
    }
  }
  return map;
}
