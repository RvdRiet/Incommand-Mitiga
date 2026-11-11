-- 0013 — re-key role_permissions to role_id (Phase 2 of configurable RBAC)
--
-- Custom roles have no membership_role enum value, so per-role module permissions
-- must be keyed by the roles-table id, not the enum. Add role_id, backfill from the
-- existing (tenant, role) rows, and make it the primary key. The old `role` column is
-- kept (now nullable) as a human-readable back-reference for the built-ins; role_id is
-- authoritative. Runs as the postgres superuser (bypasses RLS). Idempotent.

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles (id) ON DELETE CASCADE;

UPDATE role_permissions rp
SET role_id = r.id
FROM roles r
WHERE r.tenant_id = rp.tenant_id
  AND r.key = rp.role::text
  AND rp.role_id IS NULL;

-- Any row that couldn't map to a role (shouldn't exist) is dropped so the key holds.
DELETE FROM role_permissions WHERE role_id IS NULL;

-- Drop the old (tenant_id, role) primary key BEFORE relaxing role (can't drop NOT NULL
-- on a PK column), then swap the key to (role_id).
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_pkey;
ALTER TABLE role_permissions ALTER COLUMN role DROP NOT NULL;
ALTER TABLE role_permissions ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id);
CREATE INDEX IF NOT EXISTS role_permissions_tenant_idx ON role_permissions (tenant_id);
