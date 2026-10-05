import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { authTokens, tenants, users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { checkNewPassword, hashPassword } from "@/lib/auth/password";
import { lookupAuthToken } from "@/lib/auth/token-store";

const schema = z.object({ token: z.string().min(1), password: z.string() });

/**
 * POST — complete a password reset. Sets the new password, then bumps the user's
 * token_version to invalidate every existing session (forced re-login everywhere).
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "token and password required" }, { status: 400 });
  const { token: raw, password } = parsed.data;

  const policy = await checkNewPassword(password);
  if (!policy.ok) return NextResponse.json({ error: policy.error }, { status: 400 });

  const token = await lookupAuthToken(raw);
  if (!token || token.purpose !== "password_reset" || !token.user_id) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);

  const result = await withTenant(token.tenant_id, async (db) => {
    const consumed = await db
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(authTokens.id, token.id), isNull(authTokens.consumedAt)))
      .returning({ id: authTokens.id });
    if (consumed.length === 0) return { error: "already_used" as const };

    const now = new Date();
    await db
      .update(users)
      .set({
        passwordHash,
        passwordChangedAt: now,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(users.id, token.user_id!));

    const [tenant] = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, token.tenant_id))
      .limit(1);
    return { tenantSlug: tenant?.slug ?? null };
  });

  if ("error" in result) {
    return NextResponse.json({ error: "This reset link has already been used." }, { status: 409 });
  }

  await recordAuthEvent({
    tenantId: token.tenant_id,
    action: "auth.password_reset",
    actorId: token.user_id,
    entityId: token.user_id,
  });

  return NextResponse.json({ ok: true, email: token.email, tenantSlug: result.tenantSlug });
}
