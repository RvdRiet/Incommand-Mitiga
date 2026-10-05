import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3-compatible object storage for blobs (ICS PDFs, photos, bodycam video).
 * Points at MinIO in local dev (S3_ENDPOINT) and AWS S3 / Cloudflare R2 in prod
 * (unset endpoint → AWS default). Server-only — never import from client code.
 */

export const BLOB_BUCKET = process.env.S3_BUCKET ?? "incommand";

let client: S3Client | null = null;

export function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      // Unset endpoint → the SDK uses the real AWS endpoints.
      endpoint: process.env.S3_ENDPOINT || undefined,
      // MinIO and most self-hosted S3 need path-style addressing.
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return client;
}

export type PutBlobInput = {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
};

/** Upload bytes to the bucket. Returns bucket + key for the registry row. */
export async function putBlob({ key, body, contentType }: PutBlobInput) {
  await s3().send(
    new PutObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { bucket: BLOB_BUCKET, key };
}

/** Time-limited URL to download a private object (default 1h). */
export function presignGet(key: string, expiresIn = 3600) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BLOB_BUCKET, Key: key }),
    { expiresIn },
  );
}

/** Time-limited URL the client can PUT bytes to directly (for large uploads). */
export function presignPut(key: string, contentType?: string, expiresIn = 3600) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BLOB_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

export async function deleteBlob(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: BLOB_BUCKET, Key: key }));
}

/** Build a stable, tenant/incident-scoped object key. */
export function blobKey(
  tenantId: string,
  incidentId: string | null,
  kind: string,
  filename: string,
) {
  const safe = filename.replace(/[^a-z0-9._-]+/gi, "-");
  const scope = incidentId ? `incidents/${incidentId}` : "tenant";
  return `${tenantId}/${scope}/${kind}/${Date.now()}-${safe}`;
}
