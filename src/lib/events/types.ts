export type EventStatus = "none" | "planning" | "activated" | "closed";

export type EventRecord = {
  id: string;
  name: string;
  status: EventStatus;
  startDate: string;
  endDate: string;
  archived: boolean;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  /** Emoji incident icon (from the template chosen at creation). */
  icon?: string;
  /** Template the incident was created from, if any. */
  templateId?: string;
};
