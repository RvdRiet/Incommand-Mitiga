import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { authTokens } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { requireManageUsers } from "@/lib/auth/rbac";

/** DELETE — revoke a pending invitation. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireManageUsers();
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const deleted = await withTenant(session.tenantId, async (db) =>
    db
      .delete(authTokens)
      .where(and(eq(authTokens.id, id), eq(authTokens.purpose, "invite")))
      .returning({ id: authTokens.id, email: authTokens.email }),
  );

  if (deleted.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.invite_revoked",
    actorId: session.userId,
    entityId: id,
    metadata: { email: deleted[0].email },
  });
  return NextResponse.json({ ok: true });
}
