/**
 * Safe migrate-on-deploy: preview → backup → apply, with a rollback hint on failure.
 *
 *     npm run db:deploy                 # the normal deploy step
 *     npm run db:deploy -- --skip-backup  # only if a provider snapshot was just taken
 *
 * Flow:
 *   1. PREVIEW  — list pending migrations; abort if an applied file's checksum
 *                 changed (migrations must be append-only) or on any connect error.
 *   2. BACKUP   — pg_dump the DB first (skippable if your provider snapshot covers it).
 *   3. APPLY    — run the pending migrations (each in its own transaction).
 *   4. On failure, print the exact restore command for the backup just taken.
 *
 * Note: migrations are applied one transaction PER FILE, so a mid-run failure can
 * leave earlier files committed. Recover by fixing forward (a new migration) or by
 * restoring the pre-migrate backup — see docs/DB-MIGRATIONS.md.
 */
import { loadEnv, runMigrations } from "./migrate";
import { backupDatabase } from "./db-backup";

async function main() {
  loadEnv(".env.local");
  const skipBackup = process.argv.includes("--skip-backup");

  console.log("── 1. Preview ──");
  const preview = await runMigrations({ dryRun: true });

  if (preview.drift.length) {
    console.error(
      `\n❌ ${preview.drift.length} already-applied migration file(s) changed checksum ` +
        `(${preview.drift.join(", ")}). Migrations must be append-only — do NOT deploy. ` +
        `Revert the edit and add a NEW migration instead.`,
    );
    process.exit(1);
  }
  if (preview.pending.length === 0) {
    console.log("\n✅ Schema up to date — nothing to migrate.");
    return;
  }
  console.log(`\n${preview.pending.length} migration(s) to apply: ${preview.pending.join(", ")}`);

  let backupFile: string | null = null;
  if (skipBackup) {
    console.warn("\n⚠️  --skip-backup: relying on your provider snapshot for rollback.");
  } else {
    console.log("\n── 2. Backup ──");
    backupFile = backupDatabase({ label: "pre-migrate" });
  }

  console.log("\n── 3. Apply ──");
  try {
    await runMigrations();
  } catch (e) {
    console.error("\n❌ Migration failed:", e instanceof Error ? e.message : e);
    console.error("\n↩️  Rollback:");
    if (backupFile) {
      console.error("   1. Put the app in maintenance mode / stop writes.");
      console.error(`   2. pg_restore --clean --if-exists --no-acl -d "$DATABASE_ADMIN_URL" "${backupFile}"`);
      console.error("   3. Redeploy the PREVIOUS app version.");
    } else {
      console.error("   Restore the provider snapshot taken immediately before this deploy, then redeploy the previous app version.");
    }
    process.exit(1);
  }

  console.log("\n✅ Deploy migrations complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
