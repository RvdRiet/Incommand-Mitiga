import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  effectiveModulesForUser,
  invalidateUserOverridesCache,
  setRolePermissions,
  setUserOverrides,
} from "@/lib/auth/permissions-server";
import { createRole } from "@/lib/auth/roles-server";

/**
 * Per-user overrides merged over the role: allow adds, deny removes, inherit falls
 * through, and the always-on dashboard can't be denied. Requires the local stack.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("per-user module overrides", () => {
  const admin = postgres(adminUrl!, { prepare: false, max: 1, onnotice: () => {} });
  const tenantId = randomUUID();
  const userId = randomUUID();
  let roleId = "";

  beforeAll(async () => {
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'OV', ${"ov-" + tenantId.slice(0, 8)})`;
    await admin`insert into users (id, tenant_id, email, name) values (${userId}, ${tenantId}, ${"u-" + userId.slice(0, 8) + "@t.test"}, 'U')`;
    const role = await createRole(tenantId, {
      name: "Limited", rank: 15, canWrite: true, canManageUsers: false, canManageRoles: false,
    });
    roleId = role.id;
    // Role sees situation + map only.
    await setRolePermissions(tenantId, roleId, ["situation", "map"], userId);
  });

  afterAll(async () => {
    invalidateUserOverridesCache(userId);
    await admin`delete from tenants where id = ${tenantId}`; // cascades
    await admin.end({ timeout: 5 });
    await globalThis.__mitigaPostgres?.end({ timeout: 5 });
  });

  it("with no overrides, effective = the role's allow-list (+ dashboard)", async () => {
    const eff = new Set(await effectiveModulesForUser(tenantId, roleId, userId));
    expect(eff.has("situation")).toBe(true);
    expect(eff.has("map")).toBe(true);
    expect(eff.has("")).toBe(true); // always-on dashboard
    expect(eff.has("comms")).toBe(false);
  });

  it("an allow grants a module the role doesn't have", async () => {
    await setUserOverrides(tenantId, userId, [{ module: "comms", effect: "allow" }], userId);
    const eff = new Set(await effectiveModulesForUser(tenantId, roleId, userId));
    expect(eff.has("comms")).toBe(true);
    expect(eff.has("situation")).toBe(true); // role modules still inherited
  });

  it("a deny removes a module the role grants", async () => {
    await setUserOverrides(tenantId, userId, [{ module: "map", effect: "deny" }], userId);
    const eff = new Set(await effectiveModulesForUser(tenantId, roleId, userId));
    expect(eff.has("map")).toBe(false);
    expect(eff.has("situation")).toBe(true);
    expect(eff.has("comms")).toBe(false); // the earlier allow was replaced (full set)
  });

  it("the always-on dashboard can never be denied", async () => {
    await setUserOverrides(tenantId, userId, [{ module: "", effect: "deny" }], userId);
    const eff = new Set(await effectiveModulesForUser(tenantId, roleId, userId));
    expect(eff.has("")).toBe(true);
  });

  it("clearing overrides returns to the role default", async () => {
    await setUserOverrides(tenantId, userId, [], userId);
    const eff = new Set(await effectiveModulesForUser(tenantId, roleId, userId));
    expect(eff.has("map")).toBe(true);
    expect(eff.has("comms")).toBe(false);
  });
});
