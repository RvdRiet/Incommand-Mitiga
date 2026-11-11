import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { organizations, tenants } from "@/db/schema";
import { requireManageRoles } from "@/lib/auth/rbac";
import { sanitizeForJsonb } from "@/lib/incident/module-state-map";

/**
 * Save the organisation basics from the setup wizard: the tenant (district/municipality)
 * display name and the organisation name. Admin-only. The tenant `slug` is immutable
 * (it keys logins), so only the display name changes here.
 */
export async function POST(req: Request) {
  const session = await requireManageRoles();
  if (session instanceof NextResponse) return session;

  let body: { tenantName?: unknown; orgName?: unknown } | null;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = null;
  }
  // Cap lengths so a user can't store an oversized display name (it appears across
  // the app and on reports). Sanitize NUL/surrogates that Postgres text rejects.
  const clean = (v: unknown) =>
    typeof v === "string" ? sanitizeForJsonb(v).trim().slice(0, 200) : "";
  const tenantName = clean(body?.tenantName);
  const orgName = clean(body?.orgName);
  if (!tenantName) {
    return NextResponse.json({ error: "Organisation name is required." }, { status: 400 });
  }

  await withTenant(session.tenantId, async (db) => {
    await db
      .update(tenants)
      .set({ name: tenantName, updatedAt: new Date() })
      .where(eq(tenants.id, session.tenantId));
    if (orgName) {
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.tenantId, session.tenantId))
        .limit(1);
      if (org) {
        await db
          .update(organizations)
          .set({ name: orgName, updatedAt: new Date() })
          .where(eq(organizations.id, org.id));
      } else {
        await db.insert(organizations).values({ tenantId: session.tenantId, name: orgName });
      }
    }
  });

  return NextResponse.json({ ok: true, tenantName, orgName });
}
