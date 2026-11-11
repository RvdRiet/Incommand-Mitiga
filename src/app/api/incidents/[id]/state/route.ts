import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant, type MitigaDb } from "@/db/client";
import { incidents, organizations } from "@/db/schema";
import { requireSession, requireWrite } from "@/lib/auth/rbac";
import { effectiveModulesForUser } from "@/lib/auth/permissions-server";
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

/**
 * Ensure the incident row exists in THIS tenant before writing its module state.
 *   "ok"      — the incident exists in (or was just created for) this tenant
 *   "no_org"  — the tenant has no organization yet (run `npm run db:seed`)
 *   "foreign" — the id already exists under a DIFFERENT tenant (hidden by RLS): refuse,
 *               so a browser's cached state can never be grafted onto another tenant's
 *               incident id. The select is RLS-scoped, so a visible row = owned here; an
 *               insert that conflicts without a visible row means the id lives elsewhere.
 */
async function ensureIncident(
  db: MitigaDb,
  tenantId: string,
  incidentId: string,
  name: string,
): Promise<"ok" | "no_org" | "foreign"> {
  const [existing] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (existing) return "ok";

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.tenantId, tenantId))
    .limit(1);
  if (!org) return "no_org";

  const inserted = await db
    .insert(incidents)
    .values({ id: incidentId, tenantId, organizationId: org.id, name: name || "Untitled incident" })
    .onConflictDoNothing()
    .returning({ id: incidents.id });
  // Nothing inserted + nothing visible above ⇒ the id exists under another tenant.
  return inserted.length > 0 ? "ok" : "foreign";
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const allowed = new Set(await effectiveModulesForUser(session.tenantId, session.roleId, session.userId));
  const row = await withTenant(session.tenantId, (db) => readModuleState(db, id, allowed));

  if (!row) return NextResponse.json({ rev: 0, state: {}, moduleRevs: {} });
  return NextResponse.json({ rev: row.rev, state: row.state, moduleRevs: row.moduleRevs });
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  // Writing requires a contributor role — viewers are read-only. Per-module
  // authorization inside further limits which modules actually get written.
  const session = await requireWrite();
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
  const allowed = new Set(await effectiveModulesForUser(session.tenantId, session.roleId, session.userId));

  const out = await withTenant(session.tenantId, async (db) => {
    const provisioned = await ensureIncident(db, session.tenantId, id, incidentName);
    if (provisioned === "no_org") return { status: "no_org" as const };
    if (provisioned === "foreign") return { status: "foreign" as const };
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
  if (out.status === "foreign") {
    // The incident belongs to another tenant; never materialize cached state here.
    return NextResponse.json({ error: "incident not found in this tenant" }, { status: 404 });
  }
  if (out.status === "conflict") {
    return NextResponse.json(
      { error: "conflict", rev: out.rev, state: out.state, moduleRevs: out.moduleRevs, conflicts: out.conflicts },
      { status: 409 },
    );
  }
  return NextResponse.json({ rev: out.rev, moduleRevs: out.moduleRevs });
}
