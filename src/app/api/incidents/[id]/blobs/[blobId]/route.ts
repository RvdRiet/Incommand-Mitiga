import { and, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { blobs } from "@/db/schema";
import { requireSession } from "@/lib/auth/rbac";
import { effectiveModulesForUser } from "@/lib/auth/permissions-server";
import { blobKindModule } from "@/lib/incident/blob-modules";
import { presignGet } from "@/lib/storage/blob";

/**
 * Stream a single incident blob SAME-ORIGIN (e.g. an ICS-form map image embedded in a
 * form). Serving it through the app rather than a cross-origin presigned S3 URL keeps
 * the <img> same-origin, so it renders in the html2canvas PDF export without tainting
 * the canvas and without depending on S3/MinIO CORS config. Tenant-isolated via RLS;
 * respects the owning module's visibility.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; blobId: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id, blobId } = await context.params;

  const blob = await withTenant(session.tenantId, async (db) => {
    const [b] = await db
      .select()
      .from(blobs)
      .where(
        and(
          eq(blobs.id, blobId),
          // Linked to this incident, or an as-yet-unlinked upload for it (both tenant-scoped by RLS).
          or(eq(blobs.incidentId, id), isNull(blobs.incidentId)),
        ),
      )
      .limit(1);
    return b;
  });
  if (!blob) return new NextResponse("Not found", { status: 404 });

  // Same per-module visibility as the blob listing.
  const allowed = new Set(await effectiveModulesForUser(session.tenantId, session.roleId, session.userId));
  if (!allowed.has(blobKindModule(blob.kind))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Pull the bytes from S3 server-side and stream them back same-origin.
  const upstream = await fetch(await presignGet(blob.objectKey));
  if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": blob.contentType || "application/octet-stream",
      // Blob content is immutable per object key, so it's safe to cache privately.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
