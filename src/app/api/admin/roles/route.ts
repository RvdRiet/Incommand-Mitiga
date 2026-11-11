import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthEvent } from "@/lib/auth/audit";
import { ALL_MODULE_SLUGS, PERMISSION_MODULES, sanitizeModules } from "@/lib/auth/permissions";
import { setRolePermissions, storedRolePermissions } from "@/lib/auth/permissions-server";
import { requireManageRoles } from "@/lib/auth/rbac";
import { createRole, listRoles } from "@/lib/auth/roles-server";

/**
 * GET — the full role catalogue for the admin role manager: every role with its
 * capabilities + module allow-list, plus an `editable` flag (true only for roles
 * ranked strictly below the editor, so no one can touch their own or a higher role).
 */
export async function GET() {
  const session = await requireManageRoles();
  if (session instanceof NextResponse) return session;

  const [all, stored] = await Promise.all([
    listRoles(session.tenantId),
    storedRolePermissions(session.tenantId),
  ]);

  const roles = all.map((r) => ({
    ...r,
    allowed: r.id in stored ? sanitizeModules(stored[r.id]) : ALL_MODULE_SLUGS,
    customized: r.id in stored,
    editable: r.rank < session.roleRank,
  }));

  return NextResponse.json({
    modules: PERMISSION_MODULES,
    roles,
    // The editor's own ceiling, so the UI can bound rank + capability choices.
    editor: {
      rank: session.roleRank,
      canWrite: session.canWrite,
      canManageUsers: session.canManageUsers,
      canManageRoles: session.canManageRoles,
    },
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  rank: z.number().int().min(1),
  canWrite: z.boolean(),
  canManageUsers: z.boolean(),
  canManageRoles: z.boolean(),
  modules: z.array(z.string()).optional(),
});

/** POST — create a custom role below the editor's rank, with capabilities ≤ the editor's. */
export async function POST(req: Request) {
  const session = await requireManageRoles();
  if (session instanceof NextResponse) return session;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid role" }, { status: 400 });
  const input = parsed.data;

  // No privilege escalation: the new role must sit below you and may not hold a
  // capability you lack.
  if (input.rank >= session.roleRank) {
    return NextResponse.json({ error: "role rank must be below your own" }, { status: 403 });
  }
  if (
    (input.canWrite && !session.canWrite) ||
    (input.canManageUsers && !session.canManageUsers) ||
    (input.canManageRoles && !session.canManageRoles)
  ) {
    return NextResponse.json({ error: "cannot grant a capability you don't hold" }, { status: 403 });
  }

  const role = await createRole(session.tenantId, {
    name: input.name,
    rank: input.rank,
    canWrite: input.canWrite,
    canManageUsers: input.canManageUsers,
    canManageRoles: input.canManageRoles,
  });

  if (input.modules) {
    await setRolePermissions(session.tenantId, role.id, sanitizeModules(input.modules), session.userId);
  }

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.role_created",
    actorId: session.userId,
    entityId: role.id,
    metadata: { key: role.key, name: role.name, rank: role.rank },
  });

  return NextResponse.json({ role }, { status: 201 });
}
