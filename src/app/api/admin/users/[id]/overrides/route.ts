import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { memberships, roles } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { PERMISSION_MODULES } from "@/lib/auth/permissions";
import {
  allowedModulesForRoleId,
  setUserOverrides,
  userModuleOverrides,
} from "@/lib/auth/permissions-server";
import { requireManageUsers, roleRank } from "@/lib/auth/rbac";

/** The target user's role rank + role_id, or null if they aren't in the tenant. */
async function targetRole(tenantId: string, userId: string) {
  const [row] = await withTenant(tenantId, async (db) =>
    db
      .select({ roleId: memberships.roleId, role: memberships.role, rank: roles.rank })
      .from(memberships)
      .leftJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.userId, userId))
      .limit(1),
  );
  if (!row) return null;
  return { roleId: row.roleId, rank: row.rank ?? roleRank(row.role ?? "viewer") };
}

/**
 * GET — the data to edit one user's per-module overrides: the module catalogue, the
 * modules their ROLE grants (the inherit default), and their current overrides.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireManageUsers();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const target = await targetRole(session.tenantId, id);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (target.rank > session.roleRank) {
    return NextResponse.json({ error: "you can't manage a user above your own role" }, { status: 403 });
  }

  const [base, overrides] = await Promise.all([
    allowedModulesForRoleId(session.tenantId, target.roleId),
    userModuleOverrides(session.tenantId, id),
  ]);

  return NextResponse.json({ modules: PERMISSION_MODULES, base, overrides });
}

const putSchema = z.object({
  overrides: z.array(
    z.object({ module: z.string(), effect: z.enum(["allow", "deny"]) }),
  ),
});

/** PUT — replace a user's override set (user-manager, target ranked at/below you). */
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireManageUsers();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const target = await targetRole(session.tenantId, id);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (target.rank > session.roleRank) {
    return NextResponse.json({ error: "you can't manage a user above your own role" }, { status: 403 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "overrides required" }, { status: 400 });

  await setUserOverrides(session.tenantId, id, parsed.data.overrides, session.userId);

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.overrides_changed",
    actorId: session.userId,
    entityId: id,
    metadata: { count: parsed.data.overrides.length },
  });

  return NextResponse.json({ ok: true });
}
