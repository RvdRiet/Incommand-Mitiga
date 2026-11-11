import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { tenants } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { requireManageRoles } from "@/lib/auth/rbac";

/**
 * Mark the tenant's first-run setup complete, which lifts the /setup gate. Admin-only.
 * Requires the organisation name to already be set (the one hard essential); roles always
 * exist (system-seeded) and rostering is optional, so the name is the gate.
 */
export async function POST() {
  const session = await requireManageRoles();
  if (session instanceof NextResponse) return session;

  const result = await withTenant(session.tenantId, async (db) => {
    const [t] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1);
    if (!t?.name?.trim()) return { ok: false as const };
    await db
      .update(tenants)
      .set({ setupComplete: true, updatedAt: new Date() })
      .where(eq(tenants.id, session.tenantId));
    return { ok: true as const };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Set your organisation name before finishing setup." },
      { status: 400 },
    );
  }

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.setup_completed",
    actorId: session.userId,
    entityId: session.tenantId,
  });

  return NextResponse.json({ ok: true });
}
