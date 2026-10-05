-- 0011 — server-backed org roster + attendance, so the organisation-wide
--        Personnel Roster (people, experience/history) and daily attendance sync
--        across every device/browser instead of living only in each browser's
--        localStorage. Both are TENANT-scoped (org-wide), RLS-isolated per tenant.
--
-- Records carry their own `updated_at`; sync upserts are last-write-wins on it, so
-- a stale device can't clobber a newer edit. Client ids are crypto.randomUUID().
-- Idempotent. Grants to mitiga_app come from ALTER DEFAULT PRIVILEGES in 0004.

CREATE TABLE IF NOT EXISTS org_personnel (
  id         uuid PRIMARY KEY,
  tenant_id  uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  role       text NOT NULL DEFAULT '',
  team       text,
  phone      text,
  email      text,
  experience text,
  added_at   timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_personnel_tenant_idx ON org_personnel (tenant_id);

ALTER TABLE org_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_personnel FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY org_personnel_all ON org_personnel
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS attendance_records (
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  person_id   uuid NOT NULL,
  date        text NOT NULL,              -- session day, YYYY-MM-DD
  status      text NOT NULL,              -- present | late | absent | excused
  check_in_at text,                       -- HH:mm
  note        text,
  marked_at   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, person_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_tenant_idx ON attendance_records (tenant_id);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY attendance_records_all ON attendance_records
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
