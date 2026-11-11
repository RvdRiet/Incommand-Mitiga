import type { TransactionSql } from "postgres";

import { SYSTEM_ROLES } from "../../src/lib/auth/roles";

/**
 * Insert the built-in roles for a tenant (idempotent). Keeps tenants created outside
 * migration 0012 — a fresh `db:seed` or `db:new-tenant` — aligned with it. The source
 * of truth is SYSTEM_ROLES, so ranks/capabilities never drift from the app's logic.
 * Takes the transaction handle both seed scripts already run inside.
 */
export async function seedSystemRoles(sql: TransactionSql, tenantId: string): Promise<void> {
  for (const d of Object.values(SYSTEM_ROLES)) {
    await sql`
      insert into roles (tenant_id, key, name, rank, is_system, can_manage_users, can_manage_roles, can_write)
      values (${tenantId}, ${d.key}, ${d.name}, ${d.rank}, true, ${d.canManageUsers}, ${d.canManageRoles}, ${d.canWrite})
      on conflict (tenant_id, key) do nothing`;
  }
}
