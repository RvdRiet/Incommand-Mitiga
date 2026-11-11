/**
 * Take a point-in-time backup of the database BEFORE a migration (or on demand).
 *
 *     npm run db:backup
 *     tsx scripts/db-backup.ts --label pre-release
 *
 * Writes a compressed pg_dump custom-format archive to backups/, which
 * `pg_restore` can restore in full (or selectively). Uses the privileged
 * DATABASE_ADMIN_URL so it captures roles, grants and RLS policies too.
 *
 * Managed-Postgres note: your provider's automated snapshots are the primary
 * backup. This script is a cheap, explicit, pre-migration safety net you own —
 * run it (or trigger a provider snapshot) immediately before applying migrations.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";

import { loadEnv, migrationUrl } from "./migrate";

const BACKUP_DIR = "backups";

export function backupDatabase(opts?: { label?: string }): string {
  const url = migrationUrl();
  let dbName = "db";
  try {
    dbName = new URL(url).pathname.replace(/^\//, "") || "db";
  } catch {
    /* keep default */
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const label = opts?.label ? `-${opts.label.replace(/[^A-Za-z0-9_-]/g, "")}` : "";
  const file = `${BACKUP_DIR}/${dbName}-${ts}${label}.dump`;

  console.log(`Backing up ${dbName} → ${file} …`);
  // -Fc = custom, compressed; faithful full dump (owner + privileges + policies)
  // so a restore to the same cluster is an exact rollback target.
  const res = spawnSync("pg_dump", ["-Fc", "-d", url, "-f", file], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error(
      "pg_dump not found on PATH. Install the PostgreSQL client tools " +
        "(e.g. `postgresql-client` on Debian/Ubuntu, or run it inside the DB container), " +
        "or take a provider snapshot instead. See docs/DB-MIGRATIONS.md.",
    );
  }
  if (res.status !== 0) {
    throw new Error(`pg_dump exited with code ${res.status} — backup NOT written.`);
  }

  const sizeKB = Math.round(statSync(file).size / 1024);
  console.log(`✅ Backup written: ${file} (${sizeKB} KB)`);
  console.log(
    `   Restore (app stopped): pg_restore --clean --if-exists --no-acl -d "$DATABASE_ADMIN_URL" "${file}"`,
  );
  return file;
}

const isCli = process.argv[1] && /db-backup\.ts$/.test(process.argv[1]);
if (isCli) {
  loadEnv(".env.local");
  const li = process.argv.indexOf("--label");
  const label = li >= 0 ? process.argv[li + 1] : undefined;
  try {
    backupDatabase({ label });
  } catch (e) {
    console.error("\n❌ Backup failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
