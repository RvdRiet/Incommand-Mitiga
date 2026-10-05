import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/rbac";

/** GET — list the tenant's users with role + status (org_admin+). */
export async function GET() {
  const session = await requireSession("org_admin");
  if (session instanceof NextResponse) return session;

  const rows = await withTenant(session.tenantId, async (db) =>
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: memberships.role,
        organizationId: memberships.organizationId,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(memberships, eq(memberships.userId, users.id))
      .orderBy(desc(users.createdAt)),
  );

  return NextResponse.json({ users: rows });
}
