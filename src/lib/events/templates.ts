/**
 * Incident templates — chosen at event creation (mirrors D4H's "Start incident"
 * template picker: Fire / Flood / Blank). A template does the heavy lifting so a
 * new incident opens ready-to-work instead of empty: it sets the incident icon,
 * seeds a starter Situation (summary + objectives), and drops in a response
 * runbook as a task list. Localized for South African municipal disaster ops.
 */

export type IncidentTemplate = {
  id: string;
  /** Display name, also the default incident name. */
  name: string;
  /** Emoji glyph used as the incident icon across the app. */
  icon: string;
  /** One-line description shown under the tile. */
  blurb: string;
  situationSummary: string;
  objectives: string;
  /** Optional response runbook seeded as a task list. */
  runbook?: { name: string; items: string[] };
};

export const INCIDENT_TEMPLATES: IncidentTemplate[] = [
  {
    id: "flood",
    name: "Flood",
    icon: "💧",
    blurb: "Riverine or flash flooding response",
    situationSummary:
      "Flooding incident. Assess low-lying and informal settlements, road closures, water levels, and displaced residents.",
    objectives:
      "1. Confirm affected areas and cut-off communities.\n2. Open and staff shelters for displaced residents.\n3. Map road closures and safe routes.\n4. Coordinate water rescue and evacuation as required.",
    runbook: {
      name: "Flood response",
      items: [
        "Confirm affected areas and water levels",
        "Identify cut-off / isolated communities",
        "Open and staff emergency shelters",
        "Log road closures and washaways",
        "Coordinate evacuation of at-risk residents",
        "Assess damage to critical infrastructure",
        "Issue public safety advisory",
      ],
    },
  },
  {
    id: "fire",
    name: "Fire",
    icon: "🔥",
    blurb: "Wildfire / structural fire response",
    situationSummary:
      "Fire incident. Establish fire perimeter, wind direction, threatened structures, and evacuation needs.",
    objectives:
      "1. Establish and monitor the fire perimeter.\n2. Protect life and threatened structures.\n3. Track wind direction and spread.\n4. Coordinate suppression resources and water supply.",
    runbook: {
      name: "Fire response",
      items: [
        "Establish fire perimeter and spread direction",
        "Identify threatened structures and communities",
        "Order suppression resources",
        "Confirm water supply / bulk water",
        "Plan and communicate evacuation routes",
        "Establish safety zones for responders",
      ],
    },
  },
  {
    id: "storm",
    name: "Severe Storm",
    icon: "⛈️",
    blurb: "Severe weather / wind & hail response",
    situationSummary:
      "Severe weather incident. Track the system, monitor SAWS warnings, and assess wind, hail, and power-outage impacts.",
    objectives:
      "1. Monitor SAWS warnings and the Weather module.\n2. Assess structural and powerline damage.\n3. Coordinate utilities restoration.\n4. Clear roads of debris and downed lines.",
    runbook: {
      name: "Storm response",
      items: [
        "Monitor SAWS warnings and forecast (Weather module)",
        "Log powerline and structural damage",
        "Coordinate with electricity utility on outages",
        "Clear roads of debris and downed trees",
        "Check on vulnerable residents",
      ],
    },
  },
  {
    id: "blank",
    name: "Blank",
    icon: "📋",
    blurb: "Start a new empty incident",
    situationSummary: "",
    objectives: "",
  },
];

export function getIncidentTemplate(id: string | undefined): IncidentTemplate | undefined {
  return INCIDENT_TEMPLATES.find((t) => t.id === id);
}

export const DEFAULT_INCIDENT_ICON = "📍";
