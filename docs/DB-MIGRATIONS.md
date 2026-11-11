# Database migrations — deploy & rollback runbook

How InCommand changes its Postgres schema safely: how to write a migration, how it
runs on deploy, how backups work, and how to roll back when something goes wrong.

## TL;DR

```bash
npm run db:status     # preview: what's applied, what's pending (read-only, safe anytime)
npm run db:backup     # take a pg_dump archive into backups/
npm run db:deploy     # the deploy step: preview → backup → apply, with a rollback hint on failure
```

- Migrations live in `migrations/NNNN_name.sql`, applied in filename order.
- They are **append-only and forward-only**. Never edit an applied file; add a new one.
- `db:deploy` **backs up first**, then applies. Rollback = restore that backup, or fix forward.
- The migration job uses `DATABASE_ADMIN_URL` (the `postgres` superuser), never the app role.

---

## 1. How the runner works

`scripts/migrate.ts` tracks applied migrations in a `schema_migrations` table
(`version`, `checksum`, `applied_at`). On each run it:

1. Lists `migrations/*.sql` in filename order.
2. Skips any already recorded.
3. **Warns** if a recorded file's checksum changed — migrations must be append-only.
4. Applies each pending file **in its own transaction**, recording it on success.

A failing migration rolls back **that file** and aborts the run. Files already applied
earlier in the same run stay committed (see *Partial apply* under Rollback).

Credential: `DATABASE_ADMIN_URL` (falls back to `DATABASE_URL`). In production this is a
dedicated migration credential with DDL rights — **separate from the app's `mitiga_app`
role**, which has no DDL and is bound by RLS.

---

## 2. Writing a migration

Create `migrations/NNNN_short_name.sql` (next number, zero-padded, e.g. `0019_add_x.sql`).

Rules:

- **Idempotent where cheap**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  and guard policies with `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
  (see `migrations/0017_org_shifts.sql` for the pattern).
- **New tables need RLS**: `ENABLE` + `FORCE ROW LEVEL SECURITY` and a tenant policy
  (`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`). Copy an existing
  table's block — a table without RLS leaks across tenants.
- **Mirror the schema** in `src/db/schema.ts` so Drizzle/TypeScript match the DB.
- **Append-only**: once a migration has run anywhere (including a teammate's DB or prod),
  never edit it. Change your mind? Add a new migration that alters it.

### Safe changes vs breaking changes (expand / contract)

To deploy without downtime, **never ship a migration that breaks the currently-running
code**. Split breaking changes across two releases:

| Goal | ❌ Breaking (one step) | ✅ Expand → Contract (two releases) |
|---|---|---|
| Rename `col_a` → `col_b` | `ALTER … RENAME COLUMN` (old code reading `col_a` 500s) | R1: add `col_b`, backfill, code writes both/reads `col_b`. R2 (after R1 is live): drop `col_a`. |
| Drop a column | `DROP COLUMN` while old code still selects it | R1: stop using it in code. R2: `DROP COLUMN`. |
| NOT NULL on a new column | add `NOT NULL` with existing rows | add nullable + default, backfill, then `SET NOT NULL` in a later migration. |
| New required table | — | additive; safe in one step. |

Rule of thumb: **expand (additive) before you deploy code, contract (destructive) a release
later.** Additive migrations are reversible by simply redeploying the old app — the new
column just sits unused.

---

## 3. Deploying

**In CI/CD, run the migration step _before_ the new app version starts serving**, from a
job that has `DATABASE_ADMIN_URL` and `pg_dump` on its PATH (the Node image + the matching
`postgresql-client`):

```bash
npm run db:deploy
```

`db:deploy` (`scripts/db-deploy.ts`):

1. **Preview** — prints pending migrations. Aborts if an applied file's checksum changed
   (append-only violation) or the DB is unreachable.
2. **Backup** — `pg_dump -Fc` into `backups/` (skip with `-- --skip-backup` only if your
   managed provider just took a snapshot — see §4).
3. **Apply** — runs the pending migrations.
4. On failure, prints the exact `pg_restore` command for the backup it just took.

If nothing is pending it exits without touching anything.

> **Zero-downtime ordering**: because migrations are expand-first (§2), it's safe to migrate
> *before* the new code is live — the old code tolerates the additive change. For a
> contract (destructive) migration, deploy the code that stopped using the object **first**,
> then run the migration.

---

## 4. Backups

Two layers, use both:

1. **Provider snapshots (primary).** On managed Postgres (RDS/Aurora/Supabase/Cloud SQL),
   enable automated daily snapshots + point-in-time recovery. This is your real backup.
2. **Pre-migration `pg_dump` (explicit safety net).** `npm run db:backup` writes a
   compressed custom-format archive (`backups/<db>-<timestamp>.dump`) capturing tables,
   data, functions, grants **and RLS policies** (`db:deploy` does this automatically).

`backups/` is git-ignored. In production, write them to durable storage (an S3 bucket),
not the app server's local disk, and set a retention (e.g. keep 30 days).

Taking a backup where `pg_dump` isn't on PATH (e.g. this Windows dev box — it lives in the
DB container):

```bash
MSYS_NO_PATHCONV=1 docker exec incommand-postgres pg_dump -Fc -U postgres -d mitiga -f /tmp/b.dump
docker cp incommand-postgres:/tmp/b.dump ./backups/
```

---

## 5. Rollback

Pick the path by what the failed/bad migration did:

### A. Additive migration (new column/table/index) — just roll back the code
The new object is unused by the previous app version. **Redeploy the previous app build.**
Leave the column/table in place (it's harmless) or drop it later in a new migration. No DB
restore needed. This is the common case and why we expand-first.

### B. Destructive migration, or a migration that failed mid-run — restore the backup
Each migration commits per-file, so a failure in file 3 of 5 can leave files 1–2 applied.
To get back to a known-good state:

```bash
# 1. Put the app in maintenance mode / stop writes.
# 2. Restore the pre-migrate backup (db:deploy printed this path):
pg_restore --clean --if-exists --no-acl -d "$DATABASE_ADMIN_URL" "backups/<db>-<ts>-pre-migrate.dump"
# 3. Redeploy the PREVIOUS app version.
```

Or, on managed Postgres, **point-in-time-restore** to just before the deploy.

`--clean --if-exists` drops and recreates objects, so the app must be stopped during the
restore. Everything committed **after** the backup is lost — that's the cost of a destructive
rollback, and the reason destructive changes go in their own release with a fresh backup.

### C. Fix forward (often best for small issues)
If the migration applied but was wrong, don't restore — **write a new migration** that
corrects it (e.g. `0020_fix_x.sql`) and deploy again. Keeps history linear and loses no data.

### `schema_migrations` after a restore
Restoring an older backup also restores its `schema_migrations` rows, so the runner correctly
sees the rolled-back migration as *not applied* and will re-apply it on the next `db:deploy`
(after you've fixed it). No manual bookkeeping needed.

---

## 6. Commands reference

| Command | What it does |
|---|---|
| `npm run db:status` | Read-only preview: applied + pending, checksum drift. Safe anytime. |
| `npm run db:backup` | `pg_dump -Fc` → `backups/`. `-- --label <name>` to tag it. |
| `npm run db:deploy` | Preview → backup → apply (+ rollback hint on failure). The deploy step. |
| `npm run db:deploy -- --skip-backup` | Skip the pg_dump (only if a provider snapshot was just taken). |
| `npm run db:migrate` | Apply pending migrations directly (no backup). Dev use. |
| `tsx scripts/migrate.ts --baseline` | Record existing files as applied WITHOUT running (adopting an existing DB). |

## 7. Production checklist (first time)

- [ ] `DATABASE_ADMIN_URL` set in the migration job (superuser), separate from the app's `DATABASE_URL`.
- [ ] `pg_dump`/`pg_restore` (matching the server's major version) available in that job's image.
- [ ] Provider automated snapshots + PITR enabled.
- [ ] `backups/` written to durable off-box storage with retention.
- [ ] `npm run db:deploy` wired into the pipeline **before** the new app version serves traffic.
- [ ] A restore rehearsed once end-to-end into a scratch database (see §5B) — an untested backup is not a backup.
