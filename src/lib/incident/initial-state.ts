import { createDefaultContactGroups, createDefaultStatusBoard } from "./d4h-defaults";
import { newId } from "./id";
import type { IncidentState, Situation } from "./types";

export function defaultSituation(name = "New Event"): Situation {
  return {
    name,
    startDate: new Date().toISOString().slice(0, 16),
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
    taskLists: [],
    damages: [],
    residents: [],
    residentAreas: [],
    resourceRequests: [],
    roadDamages: [],
    shelters: [],
    utilities: [],
    library: [],
    mapAnnotations: [],
    supplyRoutes: [],
    calendarEvents: [],
    operationalPeriods: [],
    statusBoards: [createDefaultStatusBoard()],
    contactGroups: createDefaultContactGroups(),
    notifications: [],
    settings: {
      timezone: "America/Johannesburg",
      defaultActivationLevel: "planning",
      enablePublicPortal: false,
    },
  };
}
