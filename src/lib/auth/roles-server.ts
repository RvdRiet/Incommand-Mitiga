import { and, asc, eq } from "drizzle-orm";

import { withTenant } from "@/db/client";
import { roles } from "@/db/schema";

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  rank: number;
  isSystem: boolean;
  canWrite: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
};

/** Every role defined for a tenant (built-ins + custom), ordered by rank ascending. */
export async function listRoles(tenantId: string): Promise<RoleRow[]> {
  return withTenant(tenantId, async (db) =>
    db
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        rank: roles.rank,
        isSystem: roles.isSystem,
        canWrite: roles.canWrite,
        canManageUsers: roles.canManageUsers,
        canManageRoles: roles.canManageRoles,
      })
      .from(roles)
      .where(eq(roles.tenantId, tenantId))
      .orderBy(asc(roles.rank)),
  );
}

const ROLE_COLS = {
  id: roles.id,
  key: roles.key,
  name: roles.name,
  rank: roles.rank,
  isSystem: roles.isSystem,
  canWrite: roles.canWrite,
  canManageUsers: roles.canManageUsers,
  canManageRoles: roles.canManageRoles,
};

/** One role by id (tenant-scoped via RLS). */
export async function getRole(tenantId: string, roleId: string): Promise<RoleRow | undefined> {
  const [row] = await withTenant(tenantId, async (db) =>
    db.select(ROLE_COLS).from(roles).where(eq(roles.id, roleId)).limit(1),
  );
  return row;
}

export type RoleCapsInput = {
  name: string;
  rank: number;
  canWrite: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
};

function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "role";
}

/** Create a custom role with a tenant-unique key derived from its name. */
export async function createRole(tenantId: string, input: RoleCapsInput): Promise<RoleRow> {
  return withTenant(tenantId, async (db) => {
    const existing = await db
      .select({ key: roles.key })
      .from(roles)
      .where(eq(roles.tenantId, tenantId));
    const taken = new Set(existing.map((r) => r.key));
    const base = slugify(input.name);
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;

    const [row] = await db
      .insert(roles)
      .values({
        tenantId,
        key,
        name: input.name,
        rank: input.rank,
        isSystem: false,
        canWrite: input.canWrite,
        canManageUsers: input.canManageUsers,
        canManageRoles: input.canManageRoles,
        updatedAt: new Date(),
      })
      .returning(ROLE_COLS);
    return row;
  });
}

/** Update a custom role's name/rank/capabilities. (System roles are not editable here.) */
export async function updateRole(
  tenantId: string,
  roleId: string,
  input: RoleCapsInput,
): Promise<RoleRow | undefined> {
  const [row] = await withTenant(tenantId, async (db) =>
    db
      .update(roles)
      .set({
        name: input.name,
        rank: input.rank,
        canWrite: input.canWrite,
        canManageUsers: input.canManageUsers,
        canManageRoles: input.canManageRoles,
        updatedAt: new Date(),
      })
      .where(and(eq(roles.id, roleId), eq(roles.isSystem, false)))
      .returning(ROLE_COLS),
  );
  return row;
}

/** Delete a custom role. Throws (FK restrict) if any membership still uses it. */
export async function deleteRole(tenantId: string, roleId: string): Promise<void> {
  await withTenant(tenantId, async (db) => {
    await db.delete(roles).where(and(eq(roles.id, roleId), eq(roles.isSystem, false)));
  });
}
