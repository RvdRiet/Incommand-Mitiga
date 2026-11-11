import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/auth/rbac";

/**
 * Whether the signed-in user must change their password before using the app. Read
 * fresh from the DB (not the JWT) so the forced-change gate clears the instant the
 * change is saved. Any signed-in user may read their own flag.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const mustChangePassword = await withTenant(session.tenantId, async (db) => {
    const [u] = await db
      .select({ mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    return u?.mustChangePassword ?? false;
  });

  return NextResponse.json({ mustChangePassword });
}
