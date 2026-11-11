import { and, eq } from "drizzle-orm";

import type { MitigaDb } from "@/db/client";
import { roles } from "@/db/schema";

import { systemRole } from "./roles";

/**
 * A membership's role, resolved to its live rank + capabilities. Works for custom
 * roles (which aren't in the pure SYSTEM_ROLES map) because it reads the per-tenant
 * `roles` row. Carried on the session so downstream guards never have to re-read it.
 */
export type ResolvedRole = {
  roleId: string | null;
  key: string;
  name: string;
  rank: number;
  canWrite: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
};

/**
 * Resolve a membership's role from the `roles` table: by `roleId` when set, else by
 * the enum `key` within the tenant (covers memberships not yet carrying a role_id).
 * Falls back to the built-in descriptor if no row exists at all (defensive; every
 * tenant is seeded with the built-ins). `db` must already be tenant-scoped.
 */
export async function resolveRole(
  db: MitigaDb,
  tenantId: string,
  roleId: string | null | undefined,
  roleKey: string,
): Promise<ResolvedRole> {
  const cols = {
    id: roles.id,
    key: roles.key,
    name: roles.name,
    rank: roles.rank,
    canWrite: roles.canWrite,
    canManageUsers: roles.canManageUsers,
    canManageRoles: roles.canManageRoles,
  };

  let row:
    | { id: string; key: string; name: string; rank: number; canWrite: boolean; canManageUsers: boolean; canManageRoles: boolean }
    | undefined;

  if (roleId) {
    [row] = await db.select(cols).from(roles).where(eq(roles.id, roleId)).limit(1);
  }
  if (!row) {
    [row] = await db
      .select(cols)
      .from(roles)
      .where(and(eq(roles.tenantId, tenantId), eq(roles.key, roleKey)))
      .limit(1);
  }

  if (row) {
    return {
      roleId: row.id,
      key: row.key,
      name: row.name,
      rank: row.rank,
      canWrite: row.canWrite,
      canManageUsers: row.canManageUsers,
      canManageRoles: row.canManageRoles,
    };
  }

  // No role row at all — fall back to the built-in descriptor (keeps auth working).
  const d = systemRole(roleKey);
  return {
    roleId: roleId ?? null,
    key: d.key,
    name: d.name,
    rank: d.rank,
    canWrite: d.canWrite,
    canManageUsers: d.canManageUsers,
    canManageRoles: d.canManageRoles,
  };
}
