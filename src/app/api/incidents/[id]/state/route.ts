import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant, type MitigaDb } from "@/db/client";
import { incidents, organizations } from "@/db/schema";
import { MIN_WRITE_ROLE, requireSession } from "@/lib/auth/rbac";
import { allowedModulesForRole } from "@/lib/auth/permissions-server";
import { sanitizeForJsonb } from "@/lib/incident/module-state-map";
import { readModuleState, writeModuleState } from "@/lib/incident/state-sync-server";

/**
 * Local-first sync endpoint for an incident's operational state. The state is
 * stored per module (incident_module_state), so this endpoint enforces per-module
 * authorization: GET returns only the modules the caller's role may SEE; PUT
 * writes only the modules it may write (write requires a contributor role AND
 * visibility of that module). Optimistic concurrency uses the incident-level rev.
 */

// Hard cap on a single state PUT. Generous for a real incident (logs, personnel,
// forms, map annotations across every module) while blocking runaway paste/import
// bloat. Overridable via env for large deployments.
const MAX_STATE_BYTES = Number(process.env.INCIDENT_STATE_MAX_BYTES ?? 8 * 1024 * 1024);

async function ensureIncident(
  db: MitigaDb,
  tenantId: string,
  incidentId: string,
  name: string,
) {
  const [existing] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (existing) return true;

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.tenantId, tenantId))
    .limit(1);
  if (!org) return false; // tenant has no org — run `npm run db:seed`

  await db
    .insert(incidents)
    .values({ id: incidentId, tenantId, organizationId: org.id, name: name || "Untitled incident" })
    .onConflictDoNothing();
  return true;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const allowed = new Set(await allowedModulesForRole(session.tenantId, session.role));
  const row = await withTenant(session.tenantId, (db) => readModuleState(db, id, allowed));

  if (!row) return NextResponse.json({ rev: 0, state: {}, moduleRevs: {} });
  return NextResponse.json({ rev: row.rev, state: row.state, moduleRevs: row.moduleRevs });
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  // Writing requires a contributor role — viewers are read-only. Per-module
  // authorization inside further limits which modules actually get written.
  const session = await requireSession(MIN_WRITE_ROLE);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  // Cap the payload: the full incident state is stored as one jsonb row AND
  // mirrored into every client's offline copy, so an unbounded body is a bloat /
  // DoS vector. Reject early on the declared length, then hard-check the actual
  // bytes (Content-Length can be absent or wrong under chunked encoding).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_STATE_BYTES) {
    return NextResponse.json(
      { error: "payload too large", maxBytes: MAX_STATE_BYTES },
      { status: 413 },
    );
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_STATE_BYTES) {
    return NextResponse.json(
      { error: "payload too large", maxBytes: MAX_STATE_BYTES },
      { status: 413 },
    );
  }

  let body: {
    baseRev?: number;
    state?: Record<string, unknown>;
    moduleRevs?: Record<string, number>;
  } | null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!body || typeof body.state !== "object" || body.state === null) {
    return NextResponse.json({ error: "state object required" }, { status: 400 });
  }
  const baseRev = Number(body.baseRev ?? 0);
  const moduleRevs =
    body.moduleRevs && typeof body.moduleRevs === "object" ? body.moduleRevs : undefined;
  // Strip NUL bytes / lone surrogates up-front so bad paste-in text can't 500 the
  // sync — both the jsonb state AND the plain-text incident name go through this.
  const cleanState = sanitizeForJsonb(body.state!);
  const incidentName =
    (cleanState.situation as { name?: string } | undefined)?.name ?? "Untitled incident";
  const allowed = new Set(await allowedModulesForRole(session.tenantId, session.role));

  const out = await withTenant(session.tenantId, async (db) => {
    const provisioned = await ensureIncident(db, session.tenantId, id, incidentName);
    if (!provisioned) return { status: "no_org" as const };
    const w = await writeModuleState(db, id, session.tenantId, session.userId, cleanState, allowed, baseRev, moduleRevs);
    return w.ok
      ? { status: "ok" as const, rev: w.rev, moduleRevs: w.moduleRevs }
      : { status: "conflict" as const, rev: w.rev, state: w.state, moduleRevs: w.moduleRevs, conflicts: w.conflicts };
  });

  if (out.status === "no_org") {
    return NextResponse.json(
      { error: "no organization for tenant — run `npm run db:seed`" },
      { status: 409 },
    );
  }
  if (out.status === "conflict") {
    return NextResponse.json(
      { error: "conflict", rev: out.rev, state: out.state, moduleRevs: out.moduleRevs, conflicts: out.conflicts },
      { status: 409 },
    );
  }
  return NextResponse.json({ rev: out.rev, moduleRevs: out.moduleRevs });
}
