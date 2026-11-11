import Dexie, { type Table } from "dexie";

/**
 * The "small internal database" — an IndexedDB store (via Dexie) that holds each
 * incident's operational state locally so the app keeps working with no network,
 * and a `dirty` flag that acts as a coalesced outbox: any incident with unsynced
 * local edits gets pushed to the server by the sync engine when connectivity
 * returns. We coalesce to the latest state per incident rather than queueing every
 * keystroke — the server only needs the newest document.
 */

export type OfflineIncident = {
  /** The incident's id (same UUID the client generates for a "New event"). */
  incidentId: string;
  /** The full operational state document (the Zustand incident state). */
  state: Record<string, unknown>;
  /** Server revision this local copy was last based on (for optimistic concurrency). */
  baseRev: number;
  /** Per-module server revs this copy was based on (for per-module concurrency). */
  moduleRevs?: Record<string, number>;
  /** 1 = has local edits not yet confirmed on the server (Dexie can't index booleans). */
  dirty: number;
  /** Local last-modified epoch ms. */
  updatedAt: number;
  /** Server last-sync epoch ms (0 = never synced). */
  syncedAt: number;
};

class OfflineDB extends Dexie {
  incidents!: Table<OfflineIncident, string>;

  constructor() {
    super("incommand-offline");
    this.version(1).stores({
      // pk incidentId; secondary indexes on dirty (outbox scan) and updatedAt.
      incidents: "incidentId, dirty, updatedAt",
    });
  }
}

let db: OfflineDB | null = null;

/** Lazily open the local DB. Client-only (IndexedDB doesn't exist on the server). */
export function offlineDb(): OfflineDB {
  if (typeof window === "undefined") {
    throw new Error("offlineDb() is client-only");
  }
  if (!db) db = new OfflineDB();
  return db;
}

/** Write the latest state locally and mark it dirty (the offline-safe write path). */
export async function saveLocalState(
  incidentId: string,
  state: Record<string, unknown>,
): Promise<void> {
  const d = offlineDb();
  const existing = await d.incidents.get(incidentId);
  await d.incidents.put({
    incidentId,
    state,
    baseRev: existing?.baseRev ?? 0,
    moduleRevs: existing?.moduleRevs,
    dirty: 1,
    updatedAt: Date.now(),
    syncedAt: existing?.syncedAt ?? 0,
  });
}

/** Read the local copy (used to hydrate the UI before/without the network). */
export function readLocalState(incidentId: string) {
  return offlineDb().incidents.get(incidentId);
}

/**
 * Wipe every locally-cached incident — the Dexie outbox AND the per-incident
 * `mitiga-incident-*` localStorage copies. Called when a DIFFERENT tenant signs in on
 * this browser, so one tenant's incident state is never shown to, or synced under,
 * another tenant (the incident-level counterpart to the events-list tenant scoping).
 */
export async function clearLocalIncidentCaches(): Promise<void> {
  try {
    await offlineDb().incidents.clear();
  } catch {
    /* IndexedDB unavailable / blocked — nothing to clear */
  }
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("mitiga-incident-") || k.startsWith("mitiga-demo-")) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* private mode / storage disabled — ignore */
  }
}

/** Every incident with unsynced local edits — the outbox. */
export function pendingIncidents() {
  return offlineDb().incidents.where("dirty").equals(1).toArray();
}

/** How many incidents have unsynced local edits (for the offline indicator). */
export function pendingCount(): Promise<number> {
  try {
    return offlineDb().incidents.where("dirty").equals(1).count();
  } catch {
    return Promise.resolve(0);
  }
}
