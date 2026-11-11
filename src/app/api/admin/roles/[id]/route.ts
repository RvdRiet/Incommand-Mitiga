import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthEvent } from "@/lib/auth/audit";
import { sanitizeModules } from "@/lib/auth/permissions";
import { invalidateRolePermissionsCache, setRolePermissions } from "@/lib/auth/permissions-server";
import { requireManageRoles } from "@/lib/auth/rbac";
import { deleteRole, getRole, updateRole } from "@/lib/auth/roles-server";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  rank: z.number().int().min(1).optional(),
  canWrite: z.boolean().optional(),
  canManageUsers: z.boolean().optional(),
  canManageRoles: z.boolean().optional(),
  modules: z.array(z.string()).optional(),
});

/**
 * PATCH — edit a role below the editor's rank. For a custom role: name/rank/capabilities
 * and module access. For a built-in: module access only (its identity + rank are fixed).
 */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireManageRoles();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const target = await getRole(session.tenantId, id);
  if (!target) return NextResponse.json({ error: "role not found" }, { status: 404 });
  if (target.rank >= session.roleRank) {
    return NextResponse.json({ error: "you can only edit roles below your own" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid patch" }, { status: 400 });
  const body = parsed.data;

  const wantsRoleChange =
    body.name !== undefined || body.rank !== undefined || body.canWrite !== undefined ||
    body.canManageUsers !== undefined || body.canManageRoles !== undefined;

  if (wantsRoleChange) {
    if (target.isSystem) {
      return NextResponse.json({ error: "built-in roles can only have their module access changed" }, { status: 400 });
    }
    const rank = body.rank ?? target.rank;
    const canWrite = body.canWrite ?? target.canWrite;
    const canManageUsers = body.canManageUsers ?? target.canManageUsers;
    const canManageRoles = body.canManageRoles ?? target.canManageRoles;
    if (rank >= session.roleRank) {
      return NextResponse.json({ error: "role rank must be below your own" }, { status: 403 });
    }
    if (
      (canWrite && !session.canWrite) ||
      (canManageUsers && !session.canManageUsers) ||
      (canManageRoles && !session.canManageRoles)
    ) {
      return NextResponse.json({ error: "cannot grant a capability you don't hold" }, { status: 403 });
    }
    await updateRole(session.tenantId, id, { name: body.name ?? target.name, rank, canWrite, canManageUsers, canManageRoles });
    invalidateRolePermissionsCache(session.tenantId, id);
  }

  if (body.modules !== undefined) {
    await setRolePermissions(session.tenantId, id, sanitizeModules(body.modules), session.userId);
  }

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.role_updated",
    actorId: session.userId,
    entityId: id,
    metadata: { key: target.key, moduleChange: body.modules !== undefined, roleChange: wantsRoleChange },
  });

  const updated = await getRole(session.tenantId, id);
  return NextResponse.json({ role: updated });
}

/** DELETE — remove a custom role not assigned to anyone. */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireManageRoles();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const target = await getRole(session.tenantId, id);
  if (!target) return NextResponse.json({ error: "role not found" }, { status: 404 });
  if (target.isSystem) return NextResponse.json({ error: "built-in roles can't be deleted" }, { status: 400 });
  if (target.rank >= session.roleRank) {
    return NextResponse.json({ error: "you can only delete roles below your own" }, { status: 403 });
  }

  try {
    await deleteRole(session.tenantId, id);
  } catch (err) {
    // FK restrict → the role is still assigned to one or more members.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23503") {
      return NextResponse.json({ error: "role is assigned to users — reassign them first" }, { status: 409 });
    }
    throw err;
  }

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.role_deleted",
    actorId: session.userId,
    entityId: id,
    metadata: { key: target.key, name: target.name },
  });

  return NextResponse.json({ ok: true });
}
