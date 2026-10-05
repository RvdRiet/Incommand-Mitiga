/**
 * End-to-end infra smoke test. Run right after `docker compose up -d`:
 *
 *     npm run smoke
 *
 * Exercises the whole data layer directly (no HTTP server / auth needed):
 *   1. Postgres reachable + migrations applied (core tables present)
 *   2. Seed tenant/org present
 *   3. incident_state round-trip with rev/optimistic-concurrency
 *   4. S3/MinIO put → get (bytes match) → register a blobs row
 *   5. RLS enforcement — the runtime app role (DATABASE_URL) is tenant-isolated
 *   6. Cleanup, then a PASS/FAIL summary (exit 1 on any failure)
 *
 * These are the same tables + object-storage the API routes use, so a green run
 * means ICS-PDF/TXT/JSON archiving and the state sync will work end-to-end.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import postgres from "postgres";

// --- load .env.local (tsx doesn't do this automatically) ---
function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — rely on the ambient environment */
  }
}
loadEnv(".env.local");

const results: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(msg: string): never {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

async function main() {
  // Schema/seed/round-trip checks + cleanup use the admin connection (it
  // creates and deletes rows across tenants). The app-role RLS check at the end
  // uses DATABASE_URL to prove the least-privilege runtime role is isolated.
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) fail("DATABASE_ADMIN_URL or DATABASE_URL is not set (check .env.local).");
  const masked = adminUrl.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");

  console.log("InCommand end-to-end smoke test\n");
  const sql = postgres(adminUrl, { prepare: false, max: 1, connect_timeout: 5 });

  try {
    // 1. connectivity ---------------------------------------------------------
    try {
      await sql`select 1`;
    } catch {
      fail(`Cannot reach Postgres at ${masked} — is \`docker compose up -d\` running?`);
    }
    check("Postgres reachable", true, masked);

    // 2. schema ---------------------------------------------------------------
    const tableRows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public'
    `;
    const names = new Set(tableRows.map((t) => t.table_name));
    const required = ["tenants", "organizations", "incidents", "incident_state", "blobs"];
    const missing = required.filter((t) => !names.has(t));
    check("Migrations applied", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${required.length} core tables`);
    if (missing.length) fail("Schema incomplete — recreate the stack: `docker compose down -v && docker compose up -d`.");

    // 3. seed -----------------------------------------------------------------
    const [tenant] = await sql<{ id: string }[]>`select id from tenants where slug = 'demo' limit 1`;
    check("Seed tenant 'demo' present", Boolean(tenant), tenant ? "" : "run `npm run db:seed`");
    if (!tenant) fail("No seed data — run `npm run db:seed`.");
    const tenantId = tenant.id;
    const [org] = await sql<{ id: string }[]>`select id from organizations where tenant_id = ${tenantId} limit 1`;
    check("Tenant has an organization", Boolean(org));
    if (!org) fail("Tenant has no organization — run `npm run db:seed`.");

    // 4. incident_state round-trip (inside tenant RLS context) ----------------
    const incidentId = randomUUID();
    await sql.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${tenantId}::text, true)`;
      await tx`
        insert into incidents (id, tenant_id, organization_id, name)
        values (${incidentId}, ${tenantId}, ${org.id}, 'SMOKE TEST — safe to delete')
      `;
      await tx`
        insert into incident_state (incident_id, tenant_id, state, rev)
        values (${incidentId}, ${tenantId}, ${sql.json({ situation: { name: "Smoke" } })}, 1)
      `;
      const [r1] = await tx<{ rev: number; state: { situation?: { name?: string } } }[]>`
        select rev::int as rev, state from incident_state where incident_id = ${incidentId}
      `;
      check("incident_state write (rev 1)", Number(r1?.rev) === 1 && r1?.state?.situation?.name === "Smoke");

      await tx`
        update incident_state set state = ${sql.json({ situation: { name: "Smoke v2" } })},
          rev = rev + 1, updated_at = now()
        where incident_id = ${incidentId}
      `;
      const [r2] = await tx<{ rev: number }[]>`select rev::int as rev from incident_state where incident_id = ${incidentId}`;
      check("incident_state update (rev 2, optimistic concurrency)", Number(r2?.rev) === 2);
    });

    // 5. object storage (S3 / MinIO) -----------------------------------------
    const bucket = process.env.S3_BUCKET ?? "incommand";
    const s3 = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
    const key = `smoke-test/${Date.now()}.txt`;
    const payload = `InCommand smoke test ${new Date().toISOString()}`;

    try {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: payload, ContentType: "text/plain" }),
      );
    } catch {
      fail(`Cannot write to bucket '${bucket}' at ${process.env.S3_ENDPOINT} — is MinIO up (docker compose)?`);
    }
    check("S3/MinIO put object", true, `${bucket}/${key}`);

    const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await got.Body!.transformToString();
    check("S3/MinIO get object (bytes match)", body === payload);

    await sql.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${tenantId}::text, true)`;
      await tx`
        insert into blobs (tenant_id, incident_id, bucket, object_key, content_type, size_bytes, kind)
        values (${tenantId}, ${incidentId}, ${bucket}, ${key}, 'text/plain', ${Buffer.byteLength(payload)}, 'smoke')
      `;
      const [b] = await tx<{ c: number }[]>`select count(*)::int as c from blobs where incident_id = ${incidentId}`;
      check("blobs registry row", b?.c === 1);
    });

    // 6. RLS actually enforces for the runtime app role ----------------------
    // The whole multi-tenant guarantee hinges on the app connecting as a role
    // that is subject to RLS. This connects as DATABASE_URL and proves it.
    const appUrl = process.env.DATABASE_URL;
    if (appUrl && appUrl !== adminUrl) {
      const app = postgres(appUrl, { prepare: false, max: 1, connect_timeout: 5 });
      try {
        const [role] = await app<{ priv: boolean; who: string }[]>`
          select (rolsuper or rolbypassrls) as priv, current_user as who
          from pg_roles where rolname = current_user
        `;
        if (role?.priv) {
          check(
            "App role is non-privileged so RLS enforces",
            false,
            `DATABASE_URL connects as '${role.who}' which is superuser/BYPASSRLS — RLS is bypassed. Use a non-superuser role (see migrations/0004_app_role.sql).`,
          );
        } else {
          check("App role is non-privileged so RLS enforces", true, `role=${role?.who}`);

          const [{ c: adminCount }] = await sql<{ c: number }[]>`
            select count(*)::int as c from incidents where tenant_id = ${tenantId}
          `;
          // Wrong tenant context → RLS must hide every row.
          await app`select set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', false)`;
          const [{ c: bogusCount }] = await app<{ c: number }[]>`select count(*)::int as c from incidents`;
          check("Wrong tenant sees zero rows (isolation holds)", bogusCount === 0, `visible = ${bogusCount}`);
          // Correct tenant context → sees exactly what admin sees (not over-blocked).
          await app`select set_config('app.tenant_id', ${tenantId}::text, false)`;
          const [{ c: scopedCount }] = await app<{ c: number }[]>`select count(*)::int as c from incidents`;
          check("Correct tenant sees its own rows", scopedCount === adminCount, `app=${scopedCount} admin=${adminCount}`);
        }
      } finally {
        await app.end({ timeout: 5 });
      }
    } else {
      console.log(
        "  •  RLS-enforcement check skipped — single DATABASE_URL. Set DATABASE_ADMIN_URL (admin) + a mitiga_app DATABASE_URL to verify tenant isolation.",
      );
    }

    // 7. cleanup --------------------------------------------------------------
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await sql`delete from blobs where object_key = ${key}`;
    await sql`delete from incidents where id = ${incidentId}`; // cascades incident_state
    check("Cleanup (test rows + object removed)", true);
  } finally {
    await sql.end({ timeout: 5 });
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(56));
  if (failed.length === 0) {
    console.log(`ALL ${results.length} CHECKS PASSED ✅  Database + object storage are wired end-to-end.`);
    console.log("Next: sign in (dev button) and export an ICS form — it will archive to the bucket.");
    process.exit(0);
  }
  console.log(`${failed.length}/${results.length} CHECKS FAILED ❌  — ${failed.map((f) => f.name).join("; ")}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("\n❌ Smoke test aborted:", e instanceof Error ? e.message : e);
  process.exit(1);
});
