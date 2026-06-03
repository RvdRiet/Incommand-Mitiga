import {
  fetchEskomNationalStatus,
  stageLabel,
} from "./eskom-public";
import {
  fetchEspAreaSchedule,
  fetchEspAreasNearby,
  fetchEspNationalStatus,
} from "./eskom-se-push";
import type { LoadSheddingSnapshot, LoadSheddingStage } from "./types";

const areaIdCache = new Map<string, { id: string; expires: number }>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

function getCachedAreaId(lat: number, lng: number): string | null {
  const hit = areaIdCache.get(cacheKey(lat, lng));
  if (!hit || hit.expires < Date.now()) return null;
  return hit.id;
}

function setCachedAreaId(lat: number, lng: number, id: string) {
  areaIdCache.set(cacheKey(lat, lng), {
    id,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
}

export async function getLoadSheddingSnapshot(opts?: {
  lat?: number;
  lng?: number;
}): Promise<LoadSheddingSnapshot> {
  const token = process.env.ESP_API_TOKEN?.trim();
  const fixedAreaId = process.env.LOADSHEDDING_AREA_ID?.trim();
  const lat = opts?.lat;
  const lng = opts?.lng;
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  let nationalStage: LoadSheddingStage = 0;
  let stageUpdated: string | undefined;
  let provider: LoadSheddingSnapshot["provider"] = "eskom";
  let area: LoadSheddingSnapshot["area"] = null;

  const eskom = await fetchEskomNationalStatus();
  if (eskom) nationalStage = eskom.stage;

  if (token) {
    provider = "eskom+esp";
    const espNational = await fetchEspNationalStatus(token);
    if (espNational) {
      nationalStage = espNational.stage;
      stageUpdated = espNational.stageUpdated;
    }

    if (hasCoords) {
      let areaId = fixedAreaId ?? getCachedAreaId(lat!, lng!);
      if (!areaId) {
        const nearby = await fetchEspAreasNearby(token, lat!, lng!);
        areaId = nearby[0]?.id;
        if (areaId) setCachedAreaId(lat!, lng!, areaId);
      }
      if (areaId) {
        area = await fetchEspAreaSchedule(token, areaId);
      }
    }
  }

  return {
    provider,
    asOf: new Date().toISOString(),
    national: {
      stage: nationalStage,
      label: stageLabel(nationalStage),
      stageUpdated,
    },
    area,
    configureAreaSchedule: !area && Boolean(token) && hasCoords,
    sources: [
      { label: "Eskom schedules", url: "https://www.eskom.co.za/eskom-for-home/municipal-loadshedding/" },
      { label: "EskomSePush (ESP)", url: "https://esp.info/loadshedding" },
    ],
    disclaimer:
      "Load shedding data supports planning only. Confirm schedules with official sources before operational decisions.",
  };
}
