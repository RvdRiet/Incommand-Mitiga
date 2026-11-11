-- 0017 — org-level shifts / master roster schedule (Personnel Hub, phase 1b)
--
-- The org roster becomes the home for scheduling too: shifts are planned here against
-- org personnel (the source of truth), so an event can show a person's recent shifts
-- read-only. Mirrors the per-event Shift shape but is date-based for a standing
-- schedule. Idempotent; runs as superuser.

CREATE TABLE IF NOT EXISTS org_shifts (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES org_personnel (id) ON DELETE CASCADE,
  date        text NOT NULL DEFAULT '',   -- YYYY-MM-DD
  start_time  text NOT NULL DEFAULT '',   -- HH:mm
  end_time    text NOT NULL DEFAULT '',   -- HH:mm
  role        text NOT NULL DEFAULT '',   -- position worked this shift
  location    text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'scheduled', -- scheduled | confirmed | completed | cancelled
  added_at    timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_shifts_tenant_idx ON org_shifts (tenant_id);
CREATE INDEX IF NOT EXISTS org_shifts_person_idx ON org_shifts (person_id);

ALTER TABLE org_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_shifts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY org_shifts_all ON org_shifts
    FOR ALL USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
