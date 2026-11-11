import { and, eq } from "drizzle-orm";

import { withTenant } from "@/db/client";
import { membershipModuleOverrides, rolePermissions } from "@/db/schema";
import { ALWAYS_ON, resolveAllowed, sanitizeModules } from "./permissions";

/**
 * Role→module permissions change rarely (only via the admin matrix) but are read on
 * the hot path — every incident-state GET/PUT and every blob request resolves them.
 * A tiny per-pod TTL cache keeps that off the DB; the admin write path invalidates it
 * so a change is reflected immediately (the TTL is only a safety net for multi-pod
 * staleness). Keyed by role_id (0013) so custom roles resolve the same way.
 */
const CACHE_TTL_MS = Number(process.env.ROLE_PERMS_CACHE_TTL_MS ?? 15_000);
const permCache = new Map<string, { modules: string[]; exp: number }>();

/** Drop cached permissions for a tenant (one role, or all of them) after a change. */
export function invalidateRolePermissionsCache(tenantId: string, roleId?: string): void {
  if (roleId) {
    permCache.delete(roleId);
    return;
  }
  // No per-tenant index on the cache, so clear everything (changes are rare).
  permCache.clear();
}

/** The module slugs a given role (by id) may see in a tenant (default open if uncustomized). */
export async function allowedModulesForRoleId(
  tenantId: string,
  roleId: string | null | undefined,
): Promise<string[]> {
  // No role id → treat as uncustomized (default open). Shouldn't happen post-0012.
  if (!roleId) return [...resolveAllowed(null)];

  const hit = permCache.get(roleId);
  if (hit && hit.exp > Date.now()) return [...hit.modules];

  const [row] = await withTenant(tenantId, async (db) =>
    db
      .select({ modules: rolePermissions.modules })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .limit(1),
  );
  const modules = [...resolveAllowed(row?.modules ?? null)];
  permCache.set(roleId, { modules, exp: Date.now() + CACHE_TTL_MS });
  return [...modules];
}

/** All stored role→modules rows for a tenant, keyed by role_id (for the admin matrix). */
export async function storedRolePermissions(
  tenantId: string,
): Promise<Record<string, string[]>> {
  const rows = await withTenant(tenantId, async (db) =>
    db
      .select({ roleId: rolePermissions.roleId, modules: rolePermissions.modules })
      .from(rolePermissions)
      .where(eq(rolePermissions.tenantId, tenantId)),
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) map[r.roleId] = r.modules ?? [];
  return map;
}

/** Upsert the allowed module list for a role (by id). Returns nothing; caller invalidates cache. */
export async function setRolePermissions(
  tenantId: string,
  roleId: string,
  modules: string[],
  updatedBy: string,
): Promise<void> {
  await withTenant(tenantId, async (db) => {
    await db
      .insert(rolePermissions)
      .values({ tenantId, roleId, modules, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: rolePermissions.roleId,
        set: { modules, updatedBy, updatedAt: new Date() },
      });
  });
  invalidateRolePermissionsCache(tenantId, roleId);
}

// ── Per-user module overrides (0015) ─────────────────────────────────────────
// A person's effective access = their role's allow-list + per-user grants − denials.
// Cached per user (same hot-path concern as role permissions); the admin write path
// invalidates it.

export type UserOverride = { module: string; effect: "allow" | "deny" };

const overrideCache = new Map<string, { entries: UserOverride[]; exp: number }>();

export function invalidateUserOverridesCache(userId?: string): void {
  if (userId) overrideCache.delete(userId);
  else overrideCache.clear();
}

/** A user's raw overrides (allow/deny per module). */
export async function userModuleOverrides(
  tenantId: string,
  userId: string,
): Promise<UserOverride[]> {
  const hit = overrideCache.get(userId);
  if (hit && hit.exp > Date.now()) return [...hit.entries];

  const rows = await withTenant(tenantId, async (db) =>
    db
      .select({ module: membershipModuleOverrides.moduleSlug, effect: membershipModuleOverrides.effect })
      .from(membershipModuleOverrides)
      .where(eq(membershipModuleOverrides.userId, userId)),
  );
  const entries = rows.map((r) => ({ module: r.module, effect: r.effect }));
  overrideCache.set(userId, { entries, exp: Date.now() + CACHE_TTL_MS });
  return [...entries];
}

/**
 * The modules a user may actually see: their role's allow-list, plus `allow` grants,
 * minus `deny` denials. The always-on Overview dashboard can never be denied.
 */
export async function effectiveModulesForUser(
  tenantId: string,
  roleId: string | null | undefined,
  userId: string,
): Promise<string[]> {
  const base = new Set(await allowedModulesForRoleId(tenantId, roleId));
  const overrides = await userModuleOverrides(tenantId, userId);
  for (const o of overrides) {
    if (o.effect === "allow" && sanitizeModules([o.module]).length) base.add(o.module);
    else if (o.effect === "deny" && !ALWAYS_ON.has(o.module)) base.delete(o.module);
  }
  return [...base];
}

/** Replace a user's full override set (tenant-scoped). Caller-supplied modules are sanitized. */
export async function setUserOverrides(
  tenantId: string,
  userId: string,
  entries: UserOverride[],
  updatedBy: string,
): Promise<void> {
  // Keep only valid, restrictable module slugs, de-duped by module (last effect wins).
  const byModule = new Map<string, "allow" | "deny">();
  for (const e of entries) {
    if (sanitizeModules([e.module]).length && (e.effect === "allow" || e.effect === "deny")) {
      byModule.set(e.module, e.effect);
    }
  }

  await withTenant(tenantId, async (db) => {
    await db.delete(membershipModuleOverrides).where(eq(membershipModuleOverrides.userId, userId));
    if (byModule.size > 0) {
      await db.insert(membershipModuleOverrides).values(
        [...byModule].map(([module, effect]) => ({
          tenantId,
          userId,
          moduleSlug: module,
          effect,
          updatedBy,
          updatedAt: new Date(),
        })),
      );
    }
  });
  invalidateUserOverridesCache(userId);
}
