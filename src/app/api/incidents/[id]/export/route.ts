import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { withTenant } from "@/db/client";
import { auditLog, icsFormInstances, incidents } from "@/db/schema";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const tenantId = session?.tenantId;
  if (!tenantId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;

  try {
    const bundle = await withTenant(tenantId, async (db) => {
      const [incident] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
      if (!incident) return null;

      const forms = await db
        .select()
        .from(icsFormInstances)
        .where(eq(icsFormInstances.incidentId, id))
        .orderBy(desc(icsFormInstances.updatedAt))
        .limit(200);

      const audits = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.entityId, id)))
        .orderBy(desc(auditLog.createdAt))
        .limit(200);

      return { incident, icsForms: forms, audit: audits };
    });

    if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json(bundle, {
      headers: { "Content-Disposition": `attachment; filename="incident-${id}.json"` },
    });
  } catch {
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
