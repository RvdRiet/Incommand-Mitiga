import type { LoadSheddingStage } from "./types";

const ESKOM_BASE = "https://loadshedding.eskom.co.za/LoadShedding";

export function parseEskomStatusCode(raw: number): LoadSheddingStage {
  if (raw < 1) return 0;
  if (raw === 1) return 0;
  const stage = raw - 1;
  return Math.min(8, Math.max(1, stage)) as LoadSheddingStage;
}

export function stageLabel(stage: LoadSheddingStage): string {
  if (stage === 0) return "No load shedding";
  return `Stage ${stage}`;
}

export async function fetchEskomNationalStatus(): Promise<{
  stage: LoadSheddingStage;
  raw: number;
} | null> {
  const res = await fetch(`${ESKOM_BASE}/GetStatus`, {
    next: { revalidate: 600 },
  });
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  const raw = Number.parseInt(text, 10);
  if (!Number.isFinite(raw)) return null;
  return { stage: parseEskomStatusCode(raw), raw };
}
