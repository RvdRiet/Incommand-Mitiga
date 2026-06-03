import censusPlaces from "@/data/sa-census-2022.json";

import type { CensusPlace, CensusPlaceResult } from "./types";

const PLACES = censusPlaces as CensusPlace[];

export const CENSUS_YEAR = 2022;
export const CENSUS_SOURCE =
  "Statistics South Africa, Census 2022 (municipal factsheet / official municipal totals)";

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function placeLabel(p: CensusPlace): string {
  return `${p.seat || p.name} — ${p.province} (${formatPopulation(p.population)})`;
}

export function formatPopulation(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function searchCensusPlaces(query: string, limit = 12): CensusPlaceResult[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const scored: { place: CensusPlace; score: number }[] = [];

  for (const place of PLACES) {
    const hay = [
      place.name,
      place.seat,
      place.province,
      ...place.aliases,
    ].map(normalize);

    let score = 0;
    for (const h of hay) {
      if (h === q) score = Math.max(score, 100);
      else if (h.startsWith(q)) score = Math.max(score, 80);
      else if (h.includes(q)) score = Math.max(score, 50);
    }
    if (score > 0) scored.push({ place, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.place.population - a.place.population)
    .slice(0, limit)
    .map(({ place }) => ({ ...place, label: placeLabel(place) }));
}

export function getCensusPlaceById(id: string): CensusPlace | null {
  return PLACES.find((p) => p.id === id) ?? null;
}

export function matchCensusPlace(city: string): CensusPlace | null {
  return resolveAutofillCensusPlace(city);
}

/** Confident match for automatic fill (exact name/alias, or single strong search hit). */
export function resolveAutofillCensusPlace(query: string): CensusPlace | null {
  const q = normalize(query);
  if (q.length < 2) return null;

  const exact = PLACES.find(
    (p) =>
      normalize(p.seat) === q ||
      normalize(p.name) === q ||
      p.aliases.some((a) => normalize(a) === q),
  );
  if (exact) return exact;

  const scored: { place: CensusPlace; score: number }[] = [];
  for (const place of PLACES) {
    const hay = [place.name, place.seat, place.province, ...place.aliases].map(normalize);
    let score = 0;
    for (const h of hay) {
      if (h === q) score = 100;
      else if (h.startsWith(q)) score = Math.max(score, 85);
      else if (q.startsWith(h) && h.length >= 4) score = Math.max(score, 75);
    }
    if (score > 0) scored.push({ place, score });
  }

  scored.sort((a, b) => b.score - a.score || b.place.population - a.place.population);
  if (scored.length === 0) return null;
  if (scored[0]!.score >= 100) return scored[0]!.place;
  if (scored.length === 1 && scored[0]!.score >= 85) return scored[0]!.place;
  return null;
}
