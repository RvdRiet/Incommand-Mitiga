import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { users } from "@/db/schema";
import { enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { recordAuthEvent } from "@/lib/auth/audit";
import { checkNewPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireSession } from "@/lib/auth/rbac";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
});

/**
 * POST — the signed-in user changes their own password (self-service, and the flow
 * the forced-change gate uses). Verifies the current password, enforces the new-password
 * policy + breach check, clears `mustChangePassword`, and bumps token_version to revoke
 * every existing session — so a credential change forces a clean re-login everywhere.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  // Bound current-password guessing: even with a valid session, an attacker can't
  // brute-confirm the current password. 10 attempts per 15 min per user.
  const limited = await enforceRateLimit(`change-pw:${session.userId}`, 10, 15 * 60);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  // Reject a no-op change up front (also avoids an unnecessary breach lookup).
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "Choose a password different from your current one." }, { status: 400 });
  }

  const policy = await checkNewPassword(newPassword);
  if (!policy.ok) return NextResponse.json({ error: policy.error }, { status: 400 });

  const outcome = await withTenant(session.tenantId, async (db) => {
    const [u] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!u?.passwordHash) return { ok: false as const, status: 400, error: "No password is set on this account." };

    const valid = await verifyPassword(currentPassword, u.passwordHash);
    if (!valid) return { ok: false as const, status: 400, error: "Your current password is incorrect." };

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    await db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: now,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: now,
      })
      .where(eq(users.id, session.userId));
    return { ok: true as const };
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.password_changed",
    actorId: session.userId,
    entityId: session.userId,
  });

  return NextResponse.json({ ok: true });
}
