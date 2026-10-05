import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { rolePermissions } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { ALL_MODULE_SLUGS, PERMISSION_MODULES, sanitizeModules } from "@/lib/auth/permissions";
import { invalidateRolePermissionsCache, storedRolePermissions } from "@/lib/auth/permissions-server";
import { ROLES, type Role, requireSession, roleRank } from "@/lib/auth/rbac";

/**
 * GET — the role→module matrix an admin may edit. Only roles STRICTLY BELOW the
 * editor's rank are returned, so an admin can't change their own or a higher
 * role's access. A role with no stored row defaults to seeing every module.
 */
export async function GET() {
  const session = await requireSession("org_admin");
  if (session instanceof NextResponse) return session;

  const stored = await storedRolePermissions(session.tenantId);
  const editableRoles = ROLES.filter((r) => roleRank(r) < roleRank(session.role));

  const roles = editableRoles.map((role) => ({
    role,
    // stored allow-list, or default = everything
    allowed: role in stored ? sanitizeModules(stored[role]) : ALL_MODULE_SLUGS,
    customized: role in stored,
  }));

  return NextResponse.json({ modules: PERMISSION_MODULES, roles });
}

const putSchema = z.object({
  role: z.enum(ROLES),
  modules: z.array(z.string()),
});

/** PUT — set the module allow-list for one role (must be below the editor). */
export async function PUT(req: Request) {
  const session = await requireSession("org_admin");
  if (session instanceof NextResponse) return session;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "role and modules required" }, { status: 400 });
  const { role } = parsed.data;

  if (roleRank(role) >= roleRank(session.role)) {
    return NextResponse.json({ error: "you can only edit roles below your own" }, { status: 403 });
  }

  const modules = sanitizeModules(parsed.data.modules);

  await withTenant(session.tenantId, async (db) => {
    await db
      .insert(rolePermissions)
      .values({
        tenantId: session.tenantId,
        role: role as Role,
        modules,
        updatedBy: session.userId,
      })
      .onConflictDoUpdate({
        target: [rolePermissions.tenantId, rolePermissions.role],
        set: { modules, updatedAt: new Date(), updatedBy: session.userId },
      });
  });

  // Reflect the change on the hot path immediately (don't wait out the TTL).
  invalidateRolePermissionsCache(session.tenantId, role);

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.permissions_changed",
    actorId: session.userId,
    metadata: { role, moduleCount: modules.length, of: ALL_MODULE_SLUGS.length },
  });

  return NextResponse.json({ ok: true, role, modules });
}
