-- 0016 — org personnel photos + org-level qualifications (Personnel Hub, phase 1)
--
-- The org roster becomes the home for personnel maintenance: a photo per person and
-- their qualifications live here (the source of truth), so an event can show them
-- read-only. Mirrors the per-event Certification shape. Idempotent; runs as superuser.

ALTER TABLE org_personnel ADD COLUMN IF NOT EXISTS photo text; -- small client-resized data URL

CREATE TABLE IF NOT EXISTS org_qualifications (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES org_personnel (id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  level       text NOT NULL DEFAULT '',
  issuer      text NOT NULL DEFAULT '',
  issued_at   text NOT NULL DEFAULT '', -- ISO date string ('' = unknown)
  expires_at  text NOT NULL DEFAULT '', -- ISO date string ('' = no expiry)
  reference   text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_quals_tenant_idx ON org_qualifications (tenant_id);
CREATE INDEX IF NOT EXISTS org_quals_person_idx ON org_qualifications (person_id);

ALTER TABLE org_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_qualifications FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY org_quals_all ON org_qualifications
    FOR ALL USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
