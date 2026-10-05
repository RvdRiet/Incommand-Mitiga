/**
 * Ordered, tracked, idempotent migration runner.
 *
 *     npm run db:migrate
 *
 * Applies every migrations/*.sql not yet recorded in `schema_migrations`, in
 * filename order, each inside a transaction, recording version + checksum. Safe
 * to re-run: already-applied files are skipped; a changed checksum on an applied
 * file is reported (migrations should be append-only).
 *
 * Uses the PRIVILEGED admin connection (DDL + CREATE ROLE) — DATABASE_ADMIN_URL,
 * falling back to DATABASE_URL for single-role setups. In prod this is the
 * migration job's credential and never the app's.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on ambient env */
  }
}
loadEnv(".env.local");

const MIGRATIONS_DIR = "migrations";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_ADMIN_URL or DATABASE_URL must be set.");
    process.exit(1);
  }
  const masked = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");
  console.log(`InCommand migrations → ${masked}\n`);

  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = new Map<string, string>();
    for (const row of await sql<{ version: string; checksum: string }[]>`
      SELECT version, checksum FROM schema_migrations
    `) {
      applied.set(row.version, row.checksum);
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    // One-time adoption for a DB that predates migration tracking: record every
    // existing file as applied WITHOUT running it. Use when the schema is already
    // present (e.g. built by an earlier initdb) so the runner starts clean.
    const baseline = process.argv.includes("--baseline");
    if (baseline) {
      let marked = 0;
      for (const file of files) {
        const version = file.replace(/\.sql$/, "");
        if (applied.has(version)) continue;
        const checksum = createHash("sha256")
          .update(readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
          .digest("hex")
          .slice(0, 16);
        await sql`INSERT INTO schema_migrations (version, checksum) VALUES (${version}, ${checksum})`;
        console.log(`  ≡  ${version} — baselined (recorded, not run)`);
        marked += 1;
      }
      console.log(`\nBaselined ${marked} migration(s). Future runs apply only new ones.`);
      return;
    }

    let ran = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const body = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex").slice(0, 16);

      const prev = applied.get(version);
      if (prev) {
        if (prev !== checksum) {
          console.warn(`  ⚠️  ${version} already applied but file changed (recorded ${prev}, now ${checksum}). Migrations should be append-only.`);
        } else {
          console.log(`  •  ${version} — already applied`);
        }
        continue;
      }

      process.stdout.write(`  →  ${version} … `);
      // Each migration runs in its own transaction; a failure rolls it back and
      // aborts the run (later migrations may depend on this one).
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (version, checksum) VALUES (${version}, ${checksum})`;
      });
      console.log("applied ✅");
      ran += 1;
    }

    console.log(`\n${ran === 0 ? "Up to date." : `Applied ${ran} migration(s).`} ${files.length} total.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("\n❌ Migration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
