import type { LoadSheddingEvent, LoadSheddingStage } from "./types";
import { stageLabel } from "./eskom-public";

const ESP_BASE = "https://developer.sepush.co.za/business/2.0";

type EspStatusRegion = {
  name?: string;
  stage?: string;
  stage_updated?: string;
  next_stages?: { stage?: string; stage_start_timestamp?: string }[];
};

type EspAreaNearby = { id: string; name: string; region?: string };

type EspAreaResponse = {
  info?: { name?: string; region?: string };
  events?: { start?: string; end?: string; note?: string }[];
};

async function espFetch<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(`${ESP_BASE}${path}`, {
    headers: { token },
    next: { revalidate: 600 },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function parseEspStage(value: string | undefined): LoadSheddingStage {
  const n = Number.parseInt(value ?? "0", 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(8, n) as LoadSheddingStage;
}

export async function fetchEspNationalStatus(token: string): Promise<{
  stage: LoadSheddingStage;
  label: string;
  stageUpdated?: string;
  nextStages: { stage: LoadSheddingStage; at: string }[];
} | null> {
  const data = await espFetch<{ status?: { eskom?: EspStatusRegion } }>("/status", token);
  const eskom = data?.status?.eskom;
  if (!eskom) return null;
  const stage = parseEspStage(eskom.stage);
  return {
    stage,
    label: stageLabel(stage),
    stageUpdated: eskom.stage_updated,
    nextStages: (eskom.next_stages ?? []).map((s) => ({
      stage: parseEspStage(s.stage),
      at: s.stage_start_timestamp ?? "",
    })),
  };
}

export async function fetchEspAreasNearby(
  token: string,
  lat: number,
  lng: number,
): Promise<EspAreaNearby[]> {
  const data = await espFetch<{ areas?: EspAreaNearby[] }>(
    `/areas_nearby?lat=${lat}&lon=${lng}`,
    token,
  );
  return data?.areas ?? [];
}

export async function fetchEspAreaSchedule(
  token: string,
  areaId: string,
): Promise<{
  id: string;
  name: string;
  region: string;
  events: LoadSheddingEvent[];
} | null> {
  const data = await espFetch<EspAreaResponse>(`/area?id=${encodeURIComponent(areaId)}`, token);
  if (!data?.info?.name) return null;
  const events: LoadSheddingEvent[] = (data.events ?? [])
    .filter((e) => e.start && e.end)
    .map((e) => ({
      start: e.start!,
      end: e.end!,
      note: e.note ?? "Load shedding",
    }));
  return {
    id: areaId,
    name: data.info.name,
    region: data.info.region ?? "",
    events,
  };
}
