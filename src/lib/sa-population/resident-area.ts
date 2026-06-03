import type { ResidentArea } from "@/lib/incident/types";

import { CENSUS_YEAR, resolveAutofillCensusPlace } from "./index";
import type { CensusPlace } from "./types";

export function residentAreaPatchFromCensus(place: CensusPlace): Partial<ResidentArea> {
  return {
    city: place.seat || place.name,
    municipality: place.name,
    province: place.province,
    censusPopulation: place.population,
    censusPlaceId: place.id,
  };
}

export function tryAutofillResidentAreaFromCity(city: string): Partial<ResidentArea> | null {
  const place = resolveAutofillCensusPlace(city);
  if (!place) return null;
  return residentAreaPatchFromCensus(place);
}

export function residentAreaCensusLabel(area: ResidentArea): string | null {
  if (!area.censusPlaceId || area.censusPopulation <= 0) return null;
  return `Stats SA Census ${CENSUS_YEAR}`;
}
