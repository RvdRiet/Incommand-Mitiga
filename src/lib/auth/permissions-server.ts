import { and, eq } from "drizzle-orm";

import { withTenant } from "@/db/client";
import { rolePermissions } from "@/db/schema";
import type { Role } from "./roles";
import { resolveAllowed } from "./permissions";

/**
 * Role→module permissions change rarely (only via the admin matrix) but are read on
 * the hot path — every incident-state GET/PUT and every blob request calls
 * allowedModulesForRole. Without a cache each of those opens a second transaction +
 * round-trip just for this near-static lookup, doubling DB transaction load under
 * concurrent operators. A tiny per-pod TTL cache removes that from the hot path; the
 * admin write path calls invalidateRolePermissionsCache() so a permission change is
 * reflected immediately (the TTL is only a safety net for multi-pod staleness).
 */
const CACHE_TTL_MS = Number(process.env.ROLE_PERMS_CACHE_TTL_MS ?? 15_000);
const permCache = new Map<string, { modules: string[]; exp: number }>();
const cacheKey = (tenantId: string, role: string) => `${tenantId}:${role}`;

/** Drop cached permissions for a tenant (one role, or all of them) after a change. */
export function invalidateRolePermissionsCache(tenantId: string, role?: string): void {
  if (role) {
    permCache.delete(cacheKey(tenantId, role));
    return;
  }
  const prefix = `${tenantId}:`;
  for (const k of permCache.keys()) if (k.startsWith(prefix)) permCache.delete(k);
}

/** The module slugs a given role may see in a tenant (default open if uncustomized). */
export async function allowedModulesForRole(
  tenantId: string,
  role: string,
): Promise<string[]> {
  const key = cacheKey(tenantId, role);
  const hit = permCache.get(key);
  if (hit && hit.exp > Date.now()) return [...hit.modules];

  const [row] = await withTenant(tenantId, async (db) =>
    db
      .select({ modules: rolePermissions.modules })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.role, role as Role)))
      .limit(1),
  );
  const modules = [...resolveAllowed(row?.modules ?? null)];
  permCache.set(key, { modules, exp: Date.now() + CACHE_TTL_MS });
  return [...modules];
}

/** All stored role→modules rows for a tenant, as a map (for the admin matrix). */
export async function storedRolePermissions(
  tenantId: string,
): Promise<Record<string, string[]>> {
  const rows = await withTenant(tenantId, async (db) =>
    db
      .select({ role: rolePermissions.role, modules: rolePermissions.modules })
      .from(rolePermissions)
      .where(eq(rolePermissions.tenantId, tenantId)),
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) map[r.role] = r.modules ?? [];
  return map;
}
