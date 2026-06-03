import type { UtilityRow } from "./types";

export type UtilitySortMode = "city_asc" | "city_desc" | "impacted_desc" | "municipality_asc";

export function utilityCityKey(row: UtilityRow): string {
  const city = row.city?.trim();
  if (city) return city;
  return row.municipality.trim() || "Unassigned";
}

export function sortUtilityRows(rows: UtilityRow[], mode: UtilitySortMode): UtilityRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (mode) {
      case "city_asc":
        return utilityCityKey(a).localeCompare(utilityCityKey(b), "en", { sensitivity: "base" });
      case "city_desc":
        return utilityCityKey(b).localeCompare(utilityCityKey(a), "en", { sensitivity: "base" });
      case "municipality_asc":
        return (a.municipality || "").localeCompare(b.municipality || "", "en", {
          sensitivity: "base",
        });
      case "impacted_desc":
        return b.customersWithoutPower - a.customersWithoutPower;
      default:
        return 0;
    }
  });
  return copy;
}

export type UtilityCitySummary = {
  city: string;
  customersWithoutPower: number;
  totalCustomers: number;
  rowCount: number;
};

/** Aggregate outage counts by city for dashboard display. */
export function utilitiesByCity(rows: UtilityRow[]): UtilityCitySummary[] {
  const map = new Map<string, UtilityCitySummary>();
  for (const row of rows) {
    const city = utilityCityKey(row);
    const hit = map.get(city) ?? {
      city,
      customersWithoutPower: 0,
      totalCustomers: 0,
      rowCount: 0,
    };
    hit.customersWithoutPower += row.customersWithoutPower;
    hit.totalCustomers += row.totalCustomers;
    hit.rowCount += 1;
    map.set(city, hit);
  }
  return [...map.values()].sort((a, b) =>
    a.city.localeCompare(b.city, "en", { sensitivity: "base" }),
  );
}
