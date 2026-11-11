import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { memberships, roles, users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { type Role, requireManageUsers, roleRank } from "@/lib/auth/rbac";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_role"), roleId: z.string().uuid() }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("revoke_sessions") }),
]);

/** PATCH — manage a user: role change, disable/enable, force sign-out (org_admin+). */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireManageUsers();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid action" }, { status: 400 });
  const action = parsed.data.action;

  if (id === session.userId && (action === "disable" || action === "revoke_sessions")) {
    return NextResponse.json({ error: "you can't lock yourself out" }, { status: 400 });
  }

  const result = await withTenant(session.tenantId, async (db) => {
    // Target must be in the tenant; find their current (highest) role.
    const [target] = await db
      .select({ id: users.id, role: memberships.role })
      .from(users)
      .leftJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(users.id, id))
      .limit(1);
    if (!target) return { error: "not_found" as const };

    // No acting on someone ranked above you, and no escalating above yourself.
    if (roleRank(target.role ?? "viewer") > session.roleRank) {
      return { error: "forbidden" as const };
    }

    const now = new Date();
    if (action === "set_role") {
      // Resolve the target role within the tenant; it must sit at or below your rank.
      const [roleRow] = await db
        .select({ id: roles.id, key: roles.key, rank: roles.rank, isSystem: roles.isSystem })
        .from(roles)
        .where(and(eq(roles.tenantId, session.tenantId), eq(roles.id, parsed.data.roleId)))
        .limit(1);
      if (!roleRow) return { error: "not_found" as const };
      if (roleRow.rank > session.roleRank) return { error: "forbidden" as const };
      // role_id is authoritative; the enum mirror is the system key, or NULL for custom.
      await db
        .update(memberships)
        .set({ roleId: roleRow.id, role: roleRow.isSystem ? (roleRow.key as Role) : null })
        .where(eq(memberships.userId, id));
      return { ok: true as const, changed: roleRow.key };
    }
    if (action === "disable") {
      await db
        .update(users)
        .set({ status: "disabled", tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: now })
        .where(and(eq(users.id, id)));
      return { ok: true as const };
    }
    if (action === "enable") {
      await db
        .update(users)
        .set({ status: "active", failedLoginCount: 0, lockedUntil: null, updatedAt: now })
        .where(eq(users.id, id));
      return { ok: true as const };
    }
    // revoke_sessions
    await db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: now })
      .where(eq(users.id, id));
    return { ok: true as const };
  });

  if ("error" in result) {
    const code = result.error === "not_found" ? 404 : 403;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  const auditAction =
    action === "set_role"
      ? "auth.role_changed"
      : action === "disable"
        ? "auth.user_disabled"
        : action === "enable"
          ? "auth.user_enabled"
          : "auth.sessions_revoked";
  await recordAuthEvent({
    tenantId: session.tenantId,
    action: auditAction,
    actorId: session.userId,
    entityId: id,
    metadata: action === "set_role" ? { roleId: parsed.data.roleId } : {},
  });

  return NextResponse.json({ ok: true });
}
