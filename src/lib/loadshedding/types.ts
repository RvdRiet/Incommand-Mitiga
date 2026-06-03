export type LoadSheddingStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type LoadSheddingEvent = {
  start: string;
  end: string;
  note: string;
};

export type LoadSheddingSnapshot = {
  provider: "eskom" | "eskom+esp";
  asOf: string;
  national: {
    stage: LoadSheddingStage;
    label: string;
    stageUpdated?: string;
  };
  area: {
    id: string;
    name: string;
    region: string;
    events: LoadSheddingEvent[];
  } | null;
  configureAreaSchedule: boolean;
  sources: { label: string; url: string }[];
  disclaimer: string;
};
