/**
 * Ordered, tracked, idempotent migration runner.
 *
 *     npm run db:migrate            # apply every pending migration
 *     npm run db:status             # list applied + pending, apply nothing (pre-deploy preview)
 *     tsx scripts/migrate.ts --dry-run   # alias for --status
 *     tsx scripts/migrate.ts --baseline  # record existing files as applied WITHOUT running
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

export function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on ambient env */
  }
}

const MIGRATIONS_DIR = "migrations";

export type MigrateOptions = { dryRun?: boolean; baseline?: boolean };
export type MigrateResult = { applied: number; pending: string[]; drift: string[]; total: number };

/** Resolve the migration credential (admin first) or throw with a clear message. */
export function migrationUrl(): string {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL must be set.");
  return url;
}

/**
 * Apply pending migrations (or, with dryRun, just report them). Returns a summary.
 * Reusable by the deploy wrapper so backup+migrate share one connection path.
 */
export async function runMigrations(opts: MigrateOptions = {}): Promise<MigrateResult> {
  const url = migrationUrl();
  const masked = url.replace(/:\/\/([^:]+):[^@]+@/, "://$1:****@");
  console.log(`InCommand migrations → ${masked}${opts.dryRun ? "  (dry-run)" : ""}\n`);

  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} });
  const result: MigrateResult = { applied: 0, pending: [], drift: [], total: 0 };

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
    result.total = files.length;

    // One-time adoption for a DB that predates migration tracking.
    if (opts.baseline) {
      let marked = 0;
      for (const file of files) {
        const version = file.replace(/\.sql$/, "");
        if (applied.has(version)) continue;
        const checksum = fileChecksum(file);
        await sql`INSERT INTO schema_migrations (version, checksum) VALUES (${version}, ${checksum})`;
        console.log(`  ≡  ${version} — baselined (recorded, not run)`);
        marked += 1;
      }
      console.log(`\nBaselined ${marked} migration(s). Future runs apply only new ones.`);
      return result;
    }

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const body = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex").slice(0, 16);

      const prev = applied.get(version);
      if (prev) {
        if (prev !== checksum) {
          result.drift.push(version);
          console.warn(`  ⚠️  ${version} already applied but file changed (recorded ${prev}, now ${checksum}). Migrations must be append-only.`);
        } else {
          console.log(`  •  ${version} — already applied`);
        }
        continue;
      }

      result.pending.push(version);

      if (opts.dryRun) {
        console.log(`  ⧗  ${version} — PENDING (would apply)`);
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
      result.applied += 1;
    }

    if (opts.dryRun) {
      console.log(
        `\n${result.pending.length === 0 ? "Up to date — nothing to apply." : `${result.pending.length} migration(s) pending.`}` +
          `${result.drift.length ? ` ⚠️ ${result.drift.length} applied file(s) changed.` : ""} ${files.length} total.`,
      );
    } else {
      console.log(`\n${result.applied === 0 ? "Up to date." : `Applied ${result.applied} migration(s).`} ${files.length} total.`);
    }
    return result;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function fileChecksum(file: string): string {
  return createHash("sha256")
    .update(readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
    .digest("hex")
    .slice(0, 16);
}

// CLI entry — skipped when imported (e.g. by the deploy wrapper).
const isCli = process.argv[1] && /migrate\.ts$/.test(process.argv[1]);
if (isCli) {
  loadEnv(".env.local");
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--status");
  const baseline = process.argv.includes("--baseline");
  runMigrations({ dryRun, baseline })
    .then((r) => {
      // Drift (an already-applied migration file was edited) breaks the append-only
      // guarantee and is always a failure. In --status/--dry-run mode, outstanding
      // pending migrations are also a failure, so CI can gate on a fully-applied
      // schema (`npm run db:status`).
      if (r.drift.length > 0) {
        console.error(`\n❌ ${r.drift.length} applied migration(s) changed — migrations must be append-only.`);
        process.exit(1);
      }
      if (dryRun && r.pending.length > 0) {
        console.error(`\n❌ ${r.pending.length} migration(s) pending — run \`npm run db:migrate\`.`);
        process.exit(1);
      }
    })
    .catch((e) => {
      console.error("\n❌ Migration failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
