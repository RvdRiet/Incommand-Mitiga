-- 0012 — custom roles foundation (Phase 1 of configurable RBAC)
--
-- Moves roles from a fixed Postgres enum to a per-tenant `roles` table so a client
-- can later define their own roles. This migration only lays the FOUNDATION and is
-- NON-BREAKING: the 5 built-in roles are seeded as `is_system` rows with the exact
-- ranks + capabilities the code already enforces, and `memberships.role` (the enum)
-- stays authoritative for now — `memberships.role_id` is added and backfilled as the
-- forward pointer that later phases switch resolution over to.
--
-- Capabilities are explicit flags (not derived from rank) so a future custom role can
-- mix them freely (e.g. "can write ops data but not manage users") at any rank. Ranks
-- are spaced by 10 so custom roles can slot between the built-ins.
--
-- Runs as the privileged admin (postgres superuser → bypasses RLS), so the seed +
-- backfill below are not blocked by the tenant policies. Idempotent.

CREATE TABLE IF NOT EXISTS roles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  key              text NOT NULL,              -- stable id: enum value for system roles, slug for custom
  name             text NOT NULL,              -- display label (client-editable for custom roles)
  rank             integer NOT NULL,           -- ordering; higher = more privileged
  is_system        boolean NOT NULL DEFAULT false,
  can_manage_users boolean NOT NULL DEFAULT false,
  can_manage_roles boolean NOT NULL DEFAULT false,
  can_write        boolean NOT NULL DEFAULT false,  -- may write incident data (viewer = false)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS roles_tenant_idx ON roles (tenant_id);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY roles_all ON roles
    FOR ALL USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed the 5 built-in roles for every existing tenant, matching the capabilities the
-- code enforces today: planner+ can write; org_admin+ can manage users and roles.
INSERT INTO roles (tenant_id, key, name, rank, is_system, can_manage_users, can_manage_roles, can_write)
SELECT t.id, v.key, v.name, v.rank, true, v.cmu, v.cmr, v.cw
FROM tenants t
CROSS JOIN (VALUES
  ('viewer',           'Viewer',           10, false, false, false),
  ('planner',          'Planner',          20, false, false, true),
  ('incident_manager', 'Incident Manager', 30, false, false, true),
  ('org_admin',        'Org Admin',        40, true,  true,  true),
  ('tenant_admin',     'Tenant Admin',     50, true,  true,  true)
) AS v(key, name, rank, cmu, cmr, cw)
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Forward pointer from a membership to its role row. Nullable + ON DELETE RESTRICT
-- (a role in use can't be deleted). Backfilled from the existing enum role; the enum
-- stays the source of truth until a later phase switches resolution to role_id.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles (id) ON DELETE RESTRICT;

UPDATE memberships m
SET role_id = r.id
FROM roles r
WHERE r.tenant_id = m.tenant_id
  AND r.key = m.role::text
  AND m.role_id IS NULL;

CREATE INDEX IF NOT EXISTS memberships_role_id_idx ON memberships (role_id);
