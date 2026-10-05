import { withTenant } from "@/db/client";
import { auditLog } from "@/db/schema";
import { log } from "@/lib/observability/logger";

/**
 * Append an auth/security event to the tenant-scoped audit_log. Best-effort:
 * never let audit failure break the primary action, but do log the failure.
 */
export type AuthAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.locked"
  | "auth.logout"
  | "auth.invite_created"
  | "auth.invite_revoked"
  | "auth.invite_accepted"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "auth.user_disabled"
  | "auth.user_enabled"
  | "auth.role_changed"
  | "auth.permissions_changed"
  | "auth.mfa_enabled"
  | "auth.mfa_disabled"
  | "auth.sessions_revoked";

export async function recordAuthEvent(params: {
  tenantId: string;
  action: AuthAction;
  actorId?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await withTenant(params.tenantId, async (db) => {
      await db.insert(auditLog).values({
        tenantId: params.tenantId,
        actorId: params.actorId ?? null,
        action: params.action,
        entityType: "auth",
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? {},
      });
    });
  } catch (e) {
    log.warn("audit record failed", { action: params.action, error: (e as Error).message });
  }
}
