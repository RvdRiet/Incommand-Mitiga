/** D4H-style operational plays (runbooks) — templates expanded beyond typical collections. */

export type PlayTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  steps: { title: string; description: string }[];
};

export const PLAY_TEMPLATES: PlayTemplate[] = [
  {
    id: "activate-ics",
    name: "Activate ICS structure",
    category: "Command",
    description: "Stand up incident command, assign roles, and open the first operational period.",
    steps: [
      { title: "Confirm activation level", description: "Set planning / activated / closed in Situation." },
      { title: "Assign command staff", description: "Fill IC, PIO, Safety, and Liaison in Roles." },
      { title: "Open operational period", description: "Create OP in Calendar with objectives." },
      { title: "Publish ICS-201 briefing", description: "Complete briefing form and add to IAP." },
      { title: "Issue initial SITREP", description: "Generate and distribute from Briefings module." },
    ],
  },
  {
    id: "shelter-standup",
    name: "Shelter stand-up",
    category: "Operations",
    description: "Open and staff an emergency shelter with tracking for residents.",
    steps: [
      { title: "Identify facility", description: "Record shelter location and capacity." },
      { title: "Assign shelter manager", description: "Link personnel to shelter operations role." },
      { title: "Open shelter record", description: "Set status to open in Shelters module." },
      { title: "Register arriving residents", description: "Add residents and link to shelter." },
      { title: "Log status on board", description: "Add shelter card to Status board." },
    ],
  },
  {
    id: "resource-surge",
    name: "Resource surge request",
    category: "Logistics",
    description: "Request, track, and assign critical resources.",
    steps: [
      { title: "Log resource need", description: "Create resource request with priority." },
      { title: "Notify logistics group", description: "Send alert via Notifications." },
      { title: "Track en route / assigned", description: "Update request status through delivery." },
      { title: "Document on map", description: "Mark staging or delivery points on Map." },
    ],
  },
  {
    id: "damage-assessment",
    name: "Rapid damage assessment",
    category: "Planning",
    description: "Field teams assess and categorize damage for situational awareness.",
    steps: [
      { title: "Deploy assessment teams", description: "Assign personnel and tasks." },
      { title: "Capture damage records", description: "Enter assessments with cost estimates." },
      { title: "Plot critical sites", description: "Add map polygons for affected areas." },
      { title: "Summarize in SITREP", description: "Include totals in next briefing export." },
    ],
  },
  {
    id: "demobilization",
    name: "Demobilization checklist",
    category: "Command",
    description: "Controlled stand-down of incident operations.",
    steps: [
      { title: "Close open tasks", description: "Complete or cancel outstanding task items." },
      { title: "Close operational period", description: "End current OP in Calendar." },
      { title: "Archive status board", description: "Move remaining items to Done." },
      { title: "Set activation closed", description: "Update Situation activation to closed." },
      { title: "Export incident package", description: "Download JSON export from Settings." },
    ],
  },
  {
    id: "weather-watch",
    name: "Weather watch & warn",
    category: "Situational awareness",
    description: "Monitor conditions and warn teams when thresholds are met.",
    steps: [
      { title: "Verify incident location", description: "Lat/lng set in Situation for forecast." },
      { title: "Review Weather module", description: "Check NWS / Open-Meteo forecast." },
      { title: "Log watch message", description: "Add tagged entry to incident log." },
      { title: "Alert field teams", description: "Notify Field teams contact group." },
    ],
  },
];

export function getPlayTemplate(id: string) {
  return PLAY_TEMPLATES.find((p) => p.id === id);
}
