import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/rbac";
import { allowedModulesForRole } from "@/lib/auth/permissions-server";

/** GET — the current user's visible module slugs (role-based, per tenant). */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const allowed = await allowedModulesForRole(session.tenantId, session.role);
  return NextResponse.json({ role: session.role, allowed });
}
