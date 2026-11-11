import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { memberships, organizations, roles, users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { ROLES, type Role, requireManageUsers, roleRank } from "@/lib/auth/rbac";
import { sanitizeForJsonb } from "@/lib/incident/module-state-map";

/** GET — list the tenant's users with their role (by id + display name) + status. */
export async function GET() {
  const session = await requireManageUsers();
  if (session instanceof NextResponse) return session;

  const rows = await withTenant(session.tenantId, async (db) =>
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: memberships.role,
        roleId: memberships.roleId,
        roleName: roles.name,
        roleRank: roles.rank,
        organizationId: memberships.organizationId,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(memberships, eq(memberships.userId, users.id))
      .leftJoin(roles, eq(roles.id, memberships.roleId))
      .orderBy(desc(users.createdAt)),
  );

  return NextResponse.json({ users: rows });
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  organizationId: z.string().uuid().optional(),
});

/**
 * POST — create a user account directly (no email invite). The admin hands the user
 * a one-time temporary password (returned once here); the account is flagged
 * `mustChangePassword`, so the app forces a password change on first sign-in.
 * Admin-only, and you can only create at or below your own role (no escalation).
 */
export async function POST(req: Request) {
  const session = await requireManageUsers();
  if (session instanceof NextResponse) return session;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email, name and role are required." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const name = sanitizeForJsonb(parsed.data.name).trim().slice(0, 120);
  const role = parsed.data.role;

  if (roleRank(role) > session.roleRank) {
    return NextResponse.json({ error: "You cannot create a user with a higher role than your own." }, { status: 403 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const result = await withTenant(session.tenantId, async (db) => {
    const orgId = parsed.data.organizationId ?? session.organizationId;
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return { ok: false as const, status: 400, error: "Organisation not found in this tenant." };

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) return { ok: false as const, status: 409, error: "A user with that email already exists." };

    // Resolve the role's id (so the admin UI's role picker, which binds to roleId,
    // shows the right role). Falls back to the enum string if no row is found.
    const [roleRow] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.tenantId, session.tenantId), eq(roles.key, role)))
      .limit(1);

    const [user] = await db
      .insert(users)
      .values({
        tenantId: session.tenantId,
        email,
        name,
        passwordHash,
        status: "active",
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    await db.insert(memberships).values({
      tenantId: session.tenantId,
      userId: user.id,
      organizationId: org.id,
      role: role as Role,
      roleId: roleRow?.id ?? null,
    });

    return { ok: true as const, userId: user.id };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await recordAuthEvent({
    tenantId: session.tenantId,
    action: "auth.user_created",
    actorId: session.userId,
    entityId: result.userId,
    metadata: { email, role },
  });

  // The temporary password is returned ONCE for the admin to convey out-of-band.
  // It is never stored in plaintext and must be changed on first login.
  return NextResponse.json({
    ok: true,
    user: { id: result.userId, email, name, role },
    tempPassword,
  });
}
