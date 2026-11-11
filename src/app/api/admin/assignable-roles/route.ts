import { NextResponse } from "next/server";

import { requireManageUsers } from "@/lib/auth/rbac";
import { listRoles } from "@/lib/auth/roles-server";

/**
 * GET — the roles a user-manager may assign: everything at or below their own rank
 * (built-ins + custom). Lighter than the full role manager (which needs canManageRoles);
 * this only needs canManageUsers, so UsersAdmin can populate its role dropdowns.
 */
export async function GET() {
  const session = await requireManageUsers();
  if (session instanceof NextResponse) return session;

  const roles = (await listRoles(session.tenantId))
    .filter((r) => r.rank <= session.roleRank)
    .map((r) => ({ id: r.id, key: r.key, name: r.name, rank: r.rank, isSystem: r.isSystem }));

  return NextResponse.json({ roles });
}
