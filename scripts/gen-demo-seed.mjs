// Regenerates src/lib/incident/demo-seed.ts from scripts/fixtures/demo-incident.json.
//
// The client seed lets the fully-populated demo incident appear — already
// populated — in every browser and the desktop app with no login/network
// (expo/offline demos). Run after refreshing the fixture:
//
//     node scripts/gen-demo-seed.mjs
//
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fx = JSON.parse(
  readFileSync(join(root, "scripts", "fixtures", "demo-incident.json"), "utf8"),
);

// Flat incident state = merge of every module slice (mirrors server assembleState).
const assembled = {};
for (const m of fx.modules) Object.assign(assembled, m.state);
const sit = assembled.situation || {};

const status =
  sit.activationLevel === "activated"
    ? "activated"
    : sit.activationLevel === "closed"
      ? "closed"
      : sit.activationLevel === "planning"
        ? "planning"
        : "none";

const evt = {
  id: fx.id,
  name: fx.incident.name,
  status,
  startDate: (sit.startDate || "").slice(0, 16), // "YYYY-MM-DDTHH:mm"
  endDate: sit.endDate || "",
  archived: false,
  lat: typeof sit.lat === "number" ? sit.lat : null,
  lng: typeof sit.lng === "number" ? sit.lng : null,
  createdAt: fx.incident.createdAt || "2026-08-26T13:16:00.000Z",
};

const ts = `"use client";

// AUTO-GENERATED from scripts/fixtures/demo-incident.json via scripts/gen-demo-seed.mjs.
// Do NOT hand-edit — re-run \`node scripts/gen-demo-seed.mjs\` after refreshing the fixture.
//
// A fully-populated demo incident seeded CLIENT-SIDE so it appears — already
// populated — in every browser and the desktop app instantly, with no login or
// network required (ideal for expo/offline demos). The id matches the DB seed
// (scripts/seed.ts), so a signed-in, online client syncs the same incident
// rather than a duplicate.

import type { EventRecord } from "@/lib/events/types";

export const DEMO_EVENT_ID = ${JSON.stringify(fx.id)};

export const DEMO_EVENT: EventRecord = ${JSON.stringify(evt, null, 2)};

/** Flat incident state (assembled from every module slice in the fixture). */
export const DEMO_INCIDENT_STATE: Record<string, unknown> = ${JSON.stringify(assembled)};

const DEMO_STORAGE_KEY = \`mitiga-incident-\${DEMO_EVENT_ID}\`;

/**
 * Write the demo's populated incident state into localStorage if it isn't there
 * yet. Idempotent and NON-destructive: an existing copy (local edits, or a server
 * pull) is left untouched so it always wins over this seed.
 */
export function ensureDemoIncidentState(): void {
  if (typeof window === "undefined") return;
  try {
    if (!localStorage.getItem(DEMO_STORAGE_KEY)) {
      localStorage.setItem(
        DEMO_STORAGE_KEY,
        JSON.stringify({ state: DEMO_INCIDENT_STATE, version: 0 }),
      );
    }
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}
`;

writeFileSync(join(root, "src", "lib", "incident", "demo-seed.ts"), ts);
console.log(`wrote src/lib/incident/demo-seed.ts (${ts.length} bytes)`);
