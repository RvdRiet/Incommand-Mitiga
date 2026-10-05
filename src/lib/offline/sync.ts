import {
  offlineDb,
  pendingIncidents,
  readLocalState,
  type OfflineIncident,
} from "./db";

/**
 * Sync engine for the offline store. Pushes dirty incidents to the server sync
 * endpoint, pulls remote state, and drains the outbox automatically when the
 * network returns. Conflict policy is last-write-wins (client): on a 409 we rebase
 * onto the server rev and re-push, so no local edit is silently dropped. A field
 * merge / CRDT can slot in at `resolveConflict` later for concurrent multi-editor use.
 */

export type SyncOutcome =
  | "synced"
  | "conflict"
  | "offline"
  | "unauthorized"
  | "forbidden"
  | "error";

function stateUrl(incidentId: string) {
  return `/api/incidents/${incidentId}/state`;
}

/** Pull the server copy into the local store (hydrate on first load). */
export async function pullRemote(incidentId: string): Promise<OfflineIncident | null> {
  try {
    const res = await fetch(stateUrl(incidentId), { method: "GET" });
    if (!res.ok) return null;
    const { rev, state, moduleRevs } = (await res.json()) as {
      rev: number;
      state: Record<string, unknown>;
      moduleRevs?: Record<string, number>;
    };
    const d = offlineDb();
    const local = await d.incidents.get(incidentId);
    // Don't clobber unsynced local edits with a pull.
    if (local?.dirty) return local;
    const row: OfflineIncident = {
      incidentId,
      state,
      baseRev: rev,
      moduleRevs,
      dirty: 0,
      updatedAt: Date.now(),
      syncedAt: Date.now(),
    };
    await d.incidents.put(row);
    return row;
  } catch {
    return null;
  }
}

/**
 * Conflict resolution. Default is last-write-wins (client): keep our local state,
 * re-based on the server rev. Swap this for a field-level merge / CRDT to support
 * concurrent multi-editor use — it would also take (serverRev, serverState).
 */
function resolveConflict(local: OfflineIncident): Record<string, unknown> {
  return local.state;
}

/** Push one incident's state to the server. */
export async function pushOne(incidentId: string): Promise<SyncOutcome> {
  const d = offlineDb();
  const row = await d.incidents.get(incidentId);
  if (!row || !row.dirty) return "synced";

  try {
    const res = await fetch(stateUrl(incidentId), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRev: row.baseRev, state: row.state, moduleRevs: row.moduleRevs }),
    });

    if (res.ok) {
      const { rev, moduleRevs } = (await res.json()) as { rev: number; moduleRevs?: Record<string, number> };
      await d.incidents.update(incidentId, { baseRev: rev, moduleRevs, dirty: 0, syncedAt: Date.now() });
      return "synced";
    }

    if (res.status === 401) return "unauthorized";

    // Read-only role (viewer): the server rejects writes. Don't retry-storm — the
    // local edit stays cached, and if the role is upgraded a later push succeeds.
    if (res.status === 403) return "forbidden";

    if (res.status === 409) {
      const body = (await res.json()) as {
        rev: number;
        state?: Record<string, unknown>;
        moduleRevs?: Record<string, number>;
      };
      // LWW-client: keep our local edits, rebase onto the server's revs (whole-doc
      // and per-module), stay dirty so the next push applies the rebased modules.
      const merged = resolveConflict(row);
      await d.incidents.update(incidentId, {
        state: merged,
        baseRev: body.rev,
        moduleRevs: body.moduleRevs ?? row.moduleRevs,
        dirty: 1,
      });
      return "conflict";
    }

    return "error";
  } catch {
    return "offline";
  }
}

/** Drain the whole outbox. Returns how many synced. */
export async function syncAll(): Promise<{ synced: number; pending: number }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const pending = await pendingIncidents();
    return { synced: 0, pending: pending.length };
  }
  const pending = await pendingIncidents();
  let synced = 0;
  for (const row of pending) {
    const outcome = await pushOne(row.incidentId);
    if (outcome === "synced") synced += 1;
    if (outcome === "conflict") {
      // one re-push attempt after rebase
      if ((await pushOne(row.incidentId)) === "synced") synced += 1;
    }
    // Stop this pass on auth failures — signing in (401) or a role that can't
    // write (403) won't change mid-drain, so continuing just wastes requests.
    if (outcome === "unauthorized" || outcome === "forbidden") break;
  }
  const stillPending = await pendingIncidents();
  return { synced, pending: stillPending.length };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background sync loop: drains the outbox on an interval and whenever the
 * browser reports it's back online. Idempotent. Returns a stop() function.
 */
export function startAutoSync(intervalMs = 15000): () => void {
  if (typeof window === "undefined" || started) return () => {};
  started = true;
  const flush = () => {
    void syncAll();
  };
  window.addEventListener("online", flush);
  timer = setInterval(flush, intervalMs);
  flush();
  return () => {
    window.removeEventListener("online", flush);
    if (timer) clearInterval(timer);
    started = false;
  };
}

export { readLocalState };
