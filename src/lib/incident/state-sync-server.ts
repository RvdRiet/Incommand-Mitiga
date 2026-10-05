import { eq } from "drizzle-orm";

import type { MitigaDb } from "@/db/client";
import { incidentModuleState, incidentState } from "@/db/schema";
import {
  assembleState,
  isModuleReadable,
  splitStateByModule,
} from "./module-state-map";

/**
 * Per-module incident-state sync. Data lives in one incident_module_state row per
 * module, each with its own `rev`. Reads redact, and writes apply, only the
 * modules the caller's role may see. Concurrency is PER MODULE — two people
 * editing different modules never conflict; only concurrent same-module edits
 * rebase. The incident-level rev is kept as a whole-doc fallback for clients that
 * don't send per-module revs.
 */
type Json = Record<string, unknown>;
type ModuleRevs = Record<string, number>;

type ModuleRow = { moduleSlug: string; state: Json; rev: number };

async function moduleRows(db: MitigaDb, incidentId: string): Promise<ModuleRow[]> {
  const rows = await db
    .select({
      moduleSlug: incidentModuleState.moduleSlug,
      state: incidentModuleState.state,
      rev: incidentModuleState.rev,
    })
    .from(incidentModuleState)
    .where(eq(incidentModuleState.incidentId, incidentId));
  return rows.map((r) => ({ moduleSlug: r.moduleSlug, state: (r.state ?? {}) as Json, rev: r.rev }));
}

function readableRevs(rows: ModuleRow[], allowed: Set<string>): ModuleRevs {
  const out: ModuleRevs = {};
  for (const r of rows) if (isModuleReadable(r.moduleSlug, allowed)) out[r.moduleSlug] = r.rev;
  return out;
}

/** Assemble the readable state for a role, from module rows or legacy fallback. */
async function assembleReadable(
  db: MitigaDb,
  incidentId: string,
  allowed: Set<string>,
  legacyState: Json,
): Promise<{ state: Json; rows: ModuleRow[] }> {
  const rows = await moduleRows(db, incidentId);
  if (rows.length > 0) {
    const readable = rows.filter((r) => isModuleReadable(r.moduleSlug, allowed));
    return { state: assembleState(readable), rows };
  }
  const out: Json = {};
  for (const [slug, slice] of Object.entries(splitStateByModule(legacyState))) {
    if (isModuleReadable(slug, allowed)) Object.assign(out, slice);
  }
  return { state: out, rows: [] };
}

async function upsertModule(
  db: MitigaDb,
  incidentId: string,
  tenantId: string,
  slug: string,
  slice: Json,
  rev: number,
  userId: string,
) {
  await db
    .insert(incidentModuleState)
    .values({ incidentId, tenantId, moduleSlug: slug, state: slice, rev, updatedBy: userId })
    .onConflictDoUpdate({
      target: [incidentModuleState.incidentId, incidentModuleState.moduleSlug],
      set: { state: slice, rev, updatedAt: new Date(), updatedBy: userId },
    });
}

export type ReadResult = { rev: number; state: Json; moduleRevs: ModuleRevs };

/** Read the incident's state, redacted to the modules this role may see. */
export async function readModuleState(
  db: MitigaDb,
  incidentId: string,
  allowed: Set<string>,
): Promise<ReadResult | null> {
  const [cur] = await db
    .select({ rev: incidentState.rev, state: incidentState.state })
    .from(incidentState)
    .where(eq(incidentState.incidentId, incidentId))
    .limit(1);
  if (!cur) return null;
  const { state, rows } = await assembleReadable(db, incidentId, allowed, (cur.state ?? {}) as Json);
  return { rev: cur.rev, state, moduleRevs: readableRevs(rows, allowed) };
}

export type WriteResult =
  | { ok: true; rev: number; moduleRevs: ModuleRevs }
  | {
      ok: false;
      conflict: true;
      rev: number;
      state: Json;
      moduleRevs: ModuleRevs;
      conflicts: Record<string, { rev: number; state: Json }>;
    };

/**
 * Apply a whole-doc write, per module, honoring visibility (write requires
 * visibility) and concurrency. If `moduleRevs` is given, conflicts are per-module
 * (non-conflicting modules still apply); otherwise the incident-level `baseRev`
 * gates the whole write.
 */
export async function writeModuleState(
  db: MitigaDb,
  incidentId: string,
  tenantId: string,
  userId: string,
  incoming: Json,
  allowed: Set<string>,
  baseRev: number,
  moduleRevs?: ModuleRevs,
): Promise<WriteResult> {
  const [cur] = await db
    .select({ rev: incidentState.rev, state: incidentState.state })
    .from(incidentState)
    .where(eq(incidentState.incidentId, incidentId))
    .limit(1);
  const currentRev = cur?.rev ?? 0;

  // Legacy incident-level conflict (whole-doc clients only).
  if (!moduleRevs && cur && currentRev !== baseRev) {
    const { state, rows } = await assembleReadable(db, incidentId, allowed, (cur.state ?? {}) as Json);
    return { ok: false, conflict: true, rev: currentRev, state, moduleRevs: readableRevs(rows, allowed), conflicts: {} };
  }

  // Migrate a legacy monolithic incident into per-module rows before applying.
  let existing = await moduleRows(db, incidentId);
  const legacy = (cur?.state ?? {}) as Json;
  if (cur && existing.length === 0 && Object.keys(legacy).length > 0) {
    for (const [slug, slice] of Object.entries(splitStateByModule(legacy))) {
      await upsertModule(db, incidentId, tenantId, slug, slice, 1, userId);
    }
    existing = await moduleRows(db, incidentId);
  }
  const byslug = new Map(existing.map((r) => [r.moduleSlug, r]));

  const conflicts: Record<string, { rev: number; state: Json }> = {};
  for (const [slug, slice] of Object.entries(splitStateByModule(incoming))) {
    if (!isModuleReadable(slug, allowed)) continue; // can't write what you can't see
    const storedRev = byslug.get(slug)?.rev ?? 0;
    if (moduleRevs) {
      const base = moduleRevs[slug] ?? 0;
      if (base !== storedRev) {
        conflicts[slug] = { rev: storedRev, state: byslug.get(slug)?.state ?? {} };
        continue; // don't apply a stale same-module write
      }
    }
    await upsertModule(db, incidentId, tenantId, slug, slice, storedRev + 1, userId);
  }

  // Bump the incident-level anchor; clear the legacy mirror.
  let newRev: number;
  if (cur) {
    const [u] = await db
      .update(incidentState)
      .set({ rev: currentRev + 1, state: {}, updatedAt: new Date(), updatedBy: userId })
      .where(eq(incidentState.incidentId, incidentId))
      .returning({ rev: incidentState.rev });
    newRev = u.rev;
  } else {
    const [ins] = await db
      .insert(incidentState)
      .values({ incidentId, tenantId, state: {}, rev: 1, updatedBy: userId })
      .returning({ rev: incidentState.rev });
    newRev = ins.rev;
  }

  const fresh = await moduleRows(db, incidentId);
  const revs = readableRevs(fresh, allowed);
  if (Object.keys(conflicts).length > 0) {
    const readable = fresh.filter((r) => isModuleReadable(r.moduleSlug, allowed));
    return { ok: false, conflict: true, rev: newRev, state: assembleState(readable), moduleRevs: revs, conflicts };
  }
  return { ok: true, rev: newRev, moduleRevs: revs };
}
