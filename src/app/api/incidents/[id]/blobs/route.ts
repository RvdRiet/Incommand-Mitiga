import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { blobs, incidents } from "@/db/schema";
import { MIN_WRITE_ROLE, requireSession } from "@/lib/auth/rbac";
import { allowedModulesForRole } from "@/lib/auth/permissions-server";
import { blobKindModule } from "@/lib/incident/blob-modules";
import { BLOB_BUCKET, blobKey, presignGet, putBlob } from "@/lib/storage/blob";

/**
 * Blob upload + listing for an incident. POST a multipart `file` (plus optional
 * `kind`) → stored in S3/MinIO and registered in the `blobs` table; returns a
 * presigned download URL. GET lists the incident's blobs with fresh presigned URLs.
 */

// Cap uploads — the file is buffered fully in memory, so an unbounded upload is a
// memory-DoS vector. Generous for exports/photos/short video; overridable via env.
const MAX_UPLOAD_BYTES = Number(process.env.INCIDENT_UPLOAD_MAX_BYTES ?? 64 * 1024 * 1024);

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Uploading (archiving exports/photos/video) requires a contributor role.
  const session = await requireSession(MIN_WRITE_ROLE);
  if (session instanceof NextResponse) return session;
  const tenantId = session.tenantId;
  const { id } = await context.params;

  // Reject oversize early on the declared length before buffering anything.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "file too large", maxBytes: MAX_UPLOAD_BYTES },
      { status: 413 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "multipart 'file' required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "file too large", maxBytes: MAX_UPLOAD_BYTES },
      { status: 413 },
    );
  }
  const kind = String(form?.get("kind") ?? "attachment");
  const contentType = file.type || "application/octet-stream";
  const buf = Buffer.from(await file.arrayBuffer());
  const key = blobKey(tenantId, id, kind, file.name || "upload");

  await putBlob({ key, body: buf, contentType });

  const row = await withTenant(tenantId, async (db) => {
    // Only link to the incident if it's already a registry row (else store unlinked).
    const [inc] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, id))
      .limit(1);
    const [inserted] = await db
      .insert(blobs)
      .values({
        tenantId,
        incidentId: inc ? id : null,
        bucket: BLOB_BUCKET,
        objectKey: key,
        contentType,
        sizeBytes: buf.length,
        kind,
      })
      .returning({ id: blobs.id });
    return inserted;
  });

  const url = await presignGet(key);
  return NextResponse.json({ id: row.id, key, url, size: buf.length });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Listing archived files is allowed for any authenticated member.
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const tenantId = session.tenantId;
  const { id } = await context.params;

  const rows = await withTenant(tenantId, async (db) =>
    db
      .select()
      .from(blobs)
      .where(eq(blobs.incidentId, id))
      .orderBy(desc(blobs.createdAt))
      .limit(500),
  );

  // Only surface (and presign) files whose owning module this role may see.
  const allowed = new Set(await allowedModulesForRole(tenantId, session.role));
  const visible = rows.filter((b) => allowed.has(blobKindModule(b.kind)));

  const withUrls = await Promise.all(
    visible.map(async (b) => ({
      id: b.id,
      // Display name = the original filename (strip the "<tenant>/…/<ts>-" key prefix).
      name: (b.objectKey.split("/").pop() ?? b.objectKey).replace(/^\d+-/, ""),
      kind: b.kind,
      contentType: b.contentType,
      sizeBytes: b.sizeBytes,
      createdAt: b.createdAt,
      url: await presignGet(b.objectKey),
    })),
  );
  return NextResponse.json({ blobs: withUrls });
}
