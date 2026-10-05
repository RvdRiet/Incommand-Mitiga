-- 0007 — per-module incident state (normalizes the monolithic incident_state
--        JSON blob into one relational row per module, enabling true per-module
--        read/write authorization on the sync API).
--
-- The client still syncs a whole state document; the SERVER splits it by module
-- (see src/lib/incident/module-state-map.ts), stores each module's slice here,
-- and on read/write enforces the role's module visibility + write role. The
-- incident-level `rev` in incident_state stays the optimistic-concurrency anchor.
--
-- Idempotent. Grants to mitiga_app come from ALTER DEFAULT PRIVILEGES in 0004.
CREATE TABLE IF NOT EXISTS incident_module_state (
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  module_slug text NOT NULL,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (incident_id, module_slug)
);

CREATE INDEX IF NOT EXISTS incident_module_state_tenant_idx ON incident_module_state (tenant_id);

ALTER TABLE incident_module_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_module_state FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY incident_module_state_all ON incident_module_state
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
