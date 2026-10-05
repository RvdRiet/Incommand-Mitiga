import { createDefaultContactGroups, createDefaultStatusBoard } from "./d4h-defaults";
import { newId } from "./id";
import type { IncidentState, Situation } from "./types";

/** Fixed default so SSR and pre-hydration client paint match (not `new Date()`). */
export const DEFAULT_SITUATION_START_DATE = "2026-01-01T08:00";

export function defaultSituation(name = "New Event"): Situation {
  return {
    name,
    startDate: DEFAULT_SITUATION_START_DATE,
    endDate: "",
    location: "",
    lat: null,
    lng: null,
    summary: "",
    objectives: "",
    keyContacts: "",
    activationLevel: "planning",
  };
}

export function createInitialIncidentState(eventName = "New Event"): IncidentState {
  return {
    situation: defaultSituation(eventName),
    personnel: [],
    roleGroups: [
      { id: newId(), name: "Command Staff", roles: [] },
      { id: newId(), name: "Logistics", roles: [] },
      { id: newId(), name: "Tactical Team", roles: [] },
      { id: newId(), name: "Unassigned", roles: [] },
    ],
    logs: [],
    audit: [],
    forms: [],
    customForms: [],
    taskLists: [],
    damages: [],
    residents: [],
    residentAreas: [],
    resourceRequests: [],
    roadDamages: [],
    shelters: [],
    utilities: [],
    outages: [],
    library: [],
    mapAnnotations: [],
    supplyRoutes: [],
    calendarEvents: [],
    operationalPeriods: [],
    statusBoards: [createDefaultStatusBoard()],
    contactGroups: createDefaultContactGroups(),
    notifications: [],
    channels: [],
    fieldUnits: [],
    distressEvents: [],
    pages: [],
    shifts: [],
    certifications: [],
    inventory: [],
    settings: {
      timezone: "America/Johannesburg",
      defaultActivationLevel: "planning",
      enablePublicPortal: false,
      deviceOfflineAfterSec: 60,
      maxShiftHours: 12,
      maxOnDuty24h: 16,
      minRestHours: 8,
      certReminderDays: 30,
      inventoryReminderDays: 30,
    },
  };
}
