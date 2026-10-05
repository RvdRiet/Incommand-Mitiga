-- 0006 — per-role module visibility (regional admins control who sees what)
--
-- Each district (tenant) can restrict which incident modules a given role sees.
-- One row per (tenant, role) holding the allowed module slugs. Semantics:
--   • row present  -> that array is authoritative (empty array = sees nothing
--                     but the always-on Dashboard)
--   • no row       -> DEFAULT OPEN (the role sees every module) — non-breaking
--                     for existing tenants; admins opt into restricting.
--
-- Admins may only edit roles strictly below their own rank (enforced in the API),
-- so no one can lock themselves or a higher role out.
--
-- Idempotent. Grants to mitiga_app come from the ALTER DEFAULT PRIVILEGES in 0004.
CREATE TABLE IF NOT EXISTS role_permissions (
  tenant_id  uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  role       membership_role NOT NULL,
  modules    jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of allowed module slugs
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, role)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY role_permissions_all ON role_permissions
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
