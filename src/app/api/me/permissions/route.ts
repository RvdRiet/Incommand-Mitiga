import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/rbac";
import { effectiveModulesForUser } from "@/lib/auth/permissions-server";

/** GET — the current user's visible module slugs (role-based, per tenant). */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const allowed = await effectiveModulesForUser(session.tenantId, session.roleId, session.userId);
  return NextResponse.json({ role: session.role, allowed });
}
