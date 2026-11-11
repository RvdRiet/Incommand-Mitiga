import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { organizations, tenants } from "@/db/schema";
import { requireSession } from "@/lib/auth/rbac";

/**
 * First-run setup status for the signed-in tenant. Read fresh from the DB (not the JWT)
 * so the gate unlocks the instant setup is marked complete. Any signed-in user may read
 * it (the client gate needs it); only a manage-roles admin can change it.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const data = await withTenant(session.tenantId, async (db) => {
    const [t] = await db
      .select({ name: tenants.name, setupComplete: tenants.setupComplete })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1);
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.tenantId, session.tenantId))
      .limit(1);
    return {
      setupComplete: t?.setupComplete ?? true, // fail-safe: never trap on a missing row
      tenantName: t?.name ?? "",
      orgName: org?.name ?? "",
    };
  });

  return NextResponse.json({ ...data, canManageRoles: session.canManageRoles });
}
