import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { incidents } from "@/db/schema";
import { requireSession } from "@/lib/auth/rbac";

/**
 * Lists the incidents that belong to the caller's tenant, so the events list shows
 * incidents created on ANY device — not just this browser's local storage. RLS
 * scopes the query to the tenant; only lightweight metadata is returned (the full
 * operational state loads per-incident from /api/incidents/[id]/state on open).
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const rows = await withTenant(session.tenantId, (db) =>
    db
      .select({
        id: incidents.id,
        name: incidents.name,
        createdAt: incidents.createdAt,
        updatedAt: incidents.updatedAt,
      })
      .from(incidents)
      .orderBy(desc(incidents.updatedAt))
      .limit(500),
  );

  return NextResponse.json({ incidents: rows });
}
