import { NextResponse } from "next/server";

import { auth } from "@/auth";
import type { Session } from "next-auth";
import { roleRank, type Role } from "./roles";

// Re-export the pure role helpers so server code can import everything from rbac.
export {
  ROLES,
  roleRank,
  hasRole,
  canManageUsers,
  canManageRoles,
  canWriteIncidentData,
  MIN_WRITE_ROLE,
} from "./roles";
export type { Role } from "./roles";

export type AuthedSession = Session & {
  tenantId: string;
  userId: string;
  role: string;
  roleId: string | null;
  roleRank: number;
  canWrite: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  organizationId: string;
};

/**
 * Guard for API routes. Returns the session when authenticated, otherwise 401. When
 * `required` is given, the caller's RESOLVED rank (which works for custom roles too)
 * must meet that built-in role's rank, otherwise 403. For capability checks prefer the
 * capability guards below — a custom role's ability isn't implied by its rank.
 * Usage: `const g = await requireSession(); if (g instanceof NextResponse) return g;`
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
  if (required && (session.roleRank ?? 0) < roleRank(required)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session as AuthedSession;
}

/** 401 if not signed in; 403 unless the role may perform `capability`. */
async function requireCapability(
  capability: "canWrite" | "canManageUsers" | "canManageRoles",
): Promise<AuthedSession | NextResponse> {
  const guard = await requireSession();
  if (guard instanceof NextResponse) return guard;
  if (!guard[capability]) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return guard;
}

/** Caller may write incident data (the read-only `viewer` boundary, now capability-based). */
export function requireWrite(): Promise<AuthedSession | NextResponse> {
  return requireCapability("canWrite");
}

/** Caller may invite/manage users and assign roles. */
export function requireManageUsers(): Promise<AuthedSession | NextResponse> {
  return requireCapability("canManageUsers");
}

/** Caller may edit the role catalogue + per-role module permissions. */
export function requireManageRoles(): Promise<AuthedSession | NextResponse> {
  return requireCapability("canManageRoles");
}
