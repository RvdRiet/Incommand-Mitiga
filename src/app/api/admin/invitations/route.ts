import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { authTokens, organizations, tenants, users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { ROLES, type Role, canManageUsers, requireSession, roleRank } from "@/lib/auth/rbac";
import { sendInviteEmail } from "@/lib/email/mailer";
import { generateToken, hashToken, TOKEN_TTL } from "@/lib/auth/tokens";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
  organizationId: z.string().uuid().optional(),
});

/** GET — list pending (unconsumed, unexpired) invites for the tenant. */
export async function GET() {
  const session = await requireSession("org_admin");
  if (session instanceof NextResponse) return session;

  const rows = await withTenant(session.tenantId, async (db) =>
    db
      .select({
        id: authTokens.id,
        email: authTokens.email,
        role: authTokens.role,
        organizationId: authTokens.organizationId,
        createdAt: authTokens.createdAt,
        expiresAt: authTokens.expiresAt,
      })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.purpose, "invite"),
          isNull(authTokens.consumedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(authTokens.createdAt)),
  );
  return NextResponse.json({ invitations: rows });
}

/** POST — create an invite and email a set-password link. */
export async function POST(req: Request) {
  const session = await requireSession("org_admin");
  if (session instanceof NextResponse) return session;
  if (!canManageUsers(session.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "email and valid role required" }, { status: 400 });
  }
  const { email, role } = parsed.data;

  // No privilege escalation: you can only invite at or below your own role.
  if (roleRank(role) > roleRank(session.role)) {
    return NextResponse.json({ error: "cannot invite a higher role than your own" }, { status: 403 });
  }

  const raw = generateToken();
  const tokenHash = hashToken(raw);

  const result = await withTenant(session.tenantId, async (db) => {
    // Target org: given one (must belong to the tenant) or the inviter's own.
    const orgId = parsed.data.organizationId ?? session.organizationId;
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return { ok: false as const, error: "organization not found in tenant" };

    // Already a member?
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) return { ok: false as const, error: "a user with that email already exists" };

    const [tenant] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1);

    const [row] = await db
      .insert(authTokens)
      .values({
        tenantId: session.tenantId,
        purpose: "invite",
        email,
        tokenHash,
        role: role as Role,
        organizationId: org.id,
        createdBy: session.userId,
        expiresAt: new Date(Date.now() + TOKEN_TTL.invite),
      })
      .returning({ id: authTokens.id, expiresAt: authTokens.expiresAt });

    return { ok: true as const, id: row.id, expiresAt: row.expiresAt, tenantName: tenant?.name ?? "your district" };
  });

  if (!result.ok) {
    const code = result.error.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  const link = await sendInviteEmail({
    to: email,
    tenantName: result.tenantName,
    inviterName: session.user?.name,
    token: raw,
  });

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.invite_created",
    actorId: session.userId,
    entityId: result.id,
    metadata: { email, role },
  });

  // In dev (console email transport) surface the link so it can be copied.
  const devLink =
    process.env.NODE_ENV !== "production" && (process.env.EMAIL_TRANSPORT ?? "console") === "console"
      ? link
      : undefined;
  return NextResponse.json({ id: result.id, email, expiresAt: result.expiresAt, devLink });
}
