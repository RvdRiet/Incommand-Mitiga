import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { ROLES, type Role, requireSession, roleRank } from "@/lib/auth/rbac";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_role"), role: z.enum(ROLES) }),
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("revoke_sessions") }),
]);

/** PATCH — manage a user: role change, disable/enable, force sign-out (org_admin+). */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession("org_admin");
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
    if (roleRank(target.role ?? "viewer") > roleRank(session.role)) {
      return { error: "forbidden" as const };
    }

    const now = new Date();
    if (action === "set_role") {
      if (roleRank(parsed.data.role) > roleRank(session.role)) return { error: "forbidden" as const };
      await db
        .update(memberships)
        .set({ role: parsed.data.role as Role })
        .where(eq(memberships.userId, id));
      return { ok: true as const, changed: parsed.data.role };
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
    metadata: action === "set_role" ? { role: parsed.data.role } : {},
  });

  return NextResponse.json({ ok: true });
}
