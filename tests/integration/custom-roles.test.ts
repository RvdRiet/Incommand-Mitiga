import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTenant } from "@/db/client";
import { allowedModulesForRoleId, setRolePermissions } from "@/lib/auth/permissions-server";
import { resolveRole } from "@/lib/auth/role-resolve";
import { createRole, deleteRole, getRole, listRoles, updateRole } from "@/lib/auth/roles-server";

/**
 * Custom-role lifecycle on the real app-role path: create → permissions → resolve →
 * update → delete (incl. the FK guard that blocks deleting a role in use). Requires
 * the local stack.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("custom roles", () => {
  const admin = postgres(adminUrl!, { prepare: false, max: 1, onnotice: () => {} });
  const tenantId = randomUUID();
  const orgId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'CR', ${"cr-" + tenantId.slice(0, 8)})`;
    await admin`insert into organizations (id, tenant_id, name) values (${orgId}, ${tenantId}, 'O')`;
    await admin`insert into users (id, tenant_id, email, name) values (${userId}, ${tenantId}, ${"u-" + userId.slice(0, 8) + "@t.test"}, 'U')`;
  });

  afterAll(async () => {
    await admin`delete from tenants where id = ${tenantId}`; // cascades
    await admin.end({ timeout: 5 });
    await globalThis.__mitigaPostgres?.end({ timeout: 5 });
  });

  it("creates a custom role with a slugified key + the requested capabilities", async () => {
    const role = await createRole(tenantId, {
      name: "Dispatch Officer",
      rank: 25,
      canWrite: true,
      canManageUsers: false,
      canManageRoles: false,
    });
    expect(role.key).toBe("dispatch-officer");
    expect(role.isSystem).toBe(false);
    expect(role.rank).toBe(25);
    expect(role.canWrite).toBe(true);
    expect(role.canManageUsers).toBe(false);

    // Appears in the tenant's role list.
    const all = await listRoles(tenantId);
    expect(all.some((r) => r.id === role.id)).toBe(true);
  });

  it("resolves the role's rank + capabilities (works like a built-in)", async () => {
    const [role] = (await listRoles(tenantId)).filter((r) => !r.isSystem);
    const resolved = await withTenant(tenantId, (db) => resolveRole(db, tenantId, role.id, role.key));
    expect(resolved.rank).toBe(25);
    expect(resolved.canWrite).toBe(true);
    expect(resolved.canManageUsers).toBe(false);
    expect(resolved.key).toBe("dispatch-officer");
  });

  it("defaults to all modules, then honours a restricted allow-list", async () => {
    const [role] = (await listRoles(tenantId)).filter((r) => !r.isSystem);

    // No stored row yet → default open (sees everything + the always-on dashboard).
    const open = await allowedModulesForRoleId(tenantId, role.id);
    expect(open).toContain("personnel");
    expect(open).toContain("");

    // Restrict to two modules; dashboard stays, the rest are dropped.
    await setRolePermissions(tenantId, role.id, ["situation", "map"], userId);
    const restricted = new Set(await allowedModulesForRoleId(tenantId, role.id));
    expect(restricted.has("situation")).toBe(true);
    expect(restricted.has("map")).toBe(true);
    expect(restricted.has("")).toBe(true); // always-on dashboard
    expect(restricted.has("personnel")).toBe(false);
  });

  it("updates capabilities", async () => {
    const [role] = (await listRoles(tenantId)).filter((r) => !r.isSystem);
    await updateRole(tenantId, role.id, {
      name: role.name,
      rank: role.rank,
      canWrite: true,
      canManageUsers: true, // promote
      canManageRoles: false,
    });
    const after = await getRole(tenantId, role.id);
    expect(after?.canManageUsers).toBe(true);
  });

  it("blocks deleting a role that is still assigned, then allows it once freed", async () => {
    const [role] = (await listRoles(tenantId)).filter((r) => !r.isSystem);

    // Assign the custom role to the user (role_id authoritative, enum NULL).
    await admin`
      insert into memberships (tenant_id, user_id, organization_id, role, role_id)
      values (${tenantId}, ${userId}, ${orgId}, null, ${role.id})`;

    await expect(deleteRole(tenantId, role.id)).rejects.toMatchObject({ code: "23503" });

    // Reassign away, then deletion succeeds.
    await admin`update memberships set role_id = null where user_id = ${userId}`;
    await deleteRole(tenantId, role.id);
    expect(await getRole(tenantId, role.id)).toBeUndefined();
  });
});
