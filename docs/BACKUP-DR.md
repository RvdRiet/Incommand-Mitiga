# Backup & disaster recovery

InCommand's durable state is in two places: **Postgres** (all tenant data, auth,
incident state) and **object storage** (blobs — ICS PDFs, exports, photos, video).
Both must be backed up; the app itself is stateless and redeployable from the image.

## Recovery objectives (targets)

| | Target | How it's met |
| --- | --- | --- |
| **RPO** (max data loss) | ≤ 5 min | Postgres PITR (WAL) + object-store versioning |
| **RTO** (time to restore) | ≤ 1 hour | Restore managed DB snapshot + redeploy stateless app |

## 1. Postgres

Use **managed Postgres with point-in-time recovery** (Neon / Cloud SQL / RDS /
Supabase). Enable:

- **Automated daily snapshots**, retained ≥ 30 days.
- **PITR / WAL archiving** so you can restore to any second within the window
  (covers "someone deleted a tenant at 14:32").
- Store snapshots in a **different region** from the primary.

Manual logical backup (portable, off-provider copy) — run from the admin role:

```bash
pg_dump "$DATABASE_ADMIN_URL" --format=custom --file=incommand-$(date +%F).dump
```

Restore into a fresh database:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_ADMIN_URL" incommand-YYYY-MM-DD.dump
# then re-apply the least-privilege role grants if the target is new:
npm run db:migrate           # idempotent; recreates mitiga_app + grants (0004)
```

Note: RLS + the `mitiga_app` role are recreated by migrations, so a restored DB is
immediately usable by the app once `DATABASE_URL` points at it.

## 2. Object storage (blobs)

- Enable **bucket versioning** so overwrites/deletes are recoverable.
- Enable **cross-region replication** (or a scheduled sync) of the `incommand` bucket.
- A **lifecycle policy** keeps costs sane, e.g. transition to infrequent-access after
  90 days, expire *noncurrent* versions after 180 days (tune to retention rules).

Reconciliation: every object is registered in the `blobs` table (bucket + object_key).
After a restore, orphaned rows (object missing) surface as broken download links; a
periodic job can cross-check `blobs` against the bucket and flag mismatches.

## 3. Restore drill (run quarterly)

1. Provision a scratch DB; `pg_restore` the latest dump (or PITR to a timestamp).
2. Point a staging deploy's `DATABASE_URL` (mitiga_app) + `DATABASE_ADMIN_URL` at it;
   run `npm run db:migrate` (no-op if the dump already had the schema).
3. Restore/replicate the bucket to a scratch bucket; set `S3_*` at it.
4. `npm run smoke` + `npm test` against the restored stack — green means recoverable.
5. Record the measured RTO; investigate if it exceeds the target.

## 4. What is NOT backed up (by design)

- The app container — rebuilt from the image + `git`.
- Redis — holds only ephemeral rate-limit counters; safe to lose (fail-open).
- Client localStorage / IndexedDB — a local cache; the server copy is authoritative
  once synced.
