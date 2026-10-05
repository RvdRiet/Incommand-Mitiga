import { NextResponse } from "next/server";

import { auth } from "@/auth";
import type { Session } from "next-auth";
import { hasRole, type Role } from "./roles";

// Re-export the pure role helpers so server code can import everything from rbac.
export {
  ROLES,
  roleRank,
  hasRole,
  canManageUsers,
  canWriteIncidentData,
  MIN_WRITE_ROLE,
} from "./roles";
export type { Role } from "./roles";

export type AuthedSession = Session & {
  tenantId: string;
  userId: string;
  role: string;
  organizationId: string;
};

/**
 * Guard for API routes. Returns the session when authenticated (and, if
 * `required` is given, sufficiently privileged), otherwise a 401/403 response.
 * Usage: `const g = await requireSession("org_admin"); if (g instanceof NextResponse) return g;`
 */
export async function requireSession(
  required?: Role,
): Promise<AuthedSession | NextResponse> {
  const session = await auth();
  const tenantId = session?.tenantId;
  const userId = session?.userId;
  if (!session || !tenantId || !userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (required && !hasRole(session.role, required)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session as AuthedSession;
}
