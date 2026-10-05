import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { authTokens, memberships, tenants, users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { checkNewPassword, hashPassword } from "@/lib/auth/password";
import { lookupAuthToken } from "@/lib/auth/token-store";
import type { Role } from "@/lib/auth/rbac";

const schema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  password: z.string(),
});

/** POST — accept an invite: set name + password, creating the account + membership. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "name, password and token required" }, { status: 400 });
  }
  const { token: raw, name, password } = parsed.data;

  const policy = await checkNewPassword(password);
  if (!policy.ok) return NextResponse.json({ error: policy.error }, { status: 400 });

  const token = await lookupAuthToken(raw);
  if (!token || token.purpose !== "invite") {
    return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);

  const result = await withTenant(token.tenant_id, async (db) => {
    // Consume the token first (atomic within this transaction).
    const consumed = await db
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(authTokens.id, token.id), isNull(authTokens.consumedAt)))
      .returning({ id: authTokens.id });
    if (consumed.length === 0) return { error: "already_used" as const };

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, token.email))
      .limit(1);
    if (existing) return { error: "exists" as const };

    const now = new Date();
    const [user] = await db
      .insert(users)
      .values({
        tenantId: token.tenant_id,
        email: token.email,
        name,
        passwordHash,
        status: "active",
        emailVerifiedAt: now,
        passwordChangedAt: now,
      })
      .returning({ id: users.id });

    await db.insert(memberships).values({
      tenantId: token.tenant_id,
      userId: user.id,
      organizationId: token.organization_id!,
      role: (token.role ?? "viewer") as Role,
    });

    const [tenant] = await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, token.tenant_id))
      .limit(1);

    return { userId: user.id, tenantSlug: tenant?.slug ?? null };
  });

  if ("error" in result) {
    const msg =
      result.error === "already_used"
        ? "This invite has already been used."
        : "An account with this email already exists.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  await recordAuthEvent({
    tenantId: token.tenant_id,
    action: "auth.invite_accepted",
    actorId: result.userId,
    entityId: result.userId,
    metadata: { email: token.email },
  });

  return NextResponse.json({ ok: true, email: token.email, tenantSlug: result.tenantSlug });
}
