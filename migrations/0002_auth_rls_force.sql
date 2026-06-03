-- Auth helper: bypasses RLS safely for credential lookup only.
-- Revoke from PUBLIC in production hardening; grant only to app role.

CREATE OR REPLACE FUNCTION public.lookup_user_for_login(
  p_tenant_slug citext,
  p_email citext
)
RETURNS TABLE (
  tenant_id uuid,
  user_id uuid,
  password_hash text,
  name text,
  email citext
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.tenant_id, u.id, u.password_hash, u.name, u.email
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE t.slug = p_tenant_slug AND lower(u.email) = lower(p_email);
$$;

REVOKE ALL ON FUNCTION public.lookup_user_for_login(citext, citext) FROM PUBLIC;

-- Enforce RLS even for table owners (production posture).
-- `tenants` is intentionally omitted from FORCE so bootstrap/seed can create a tenant when using the table owner role (e.g. local dev). App traffic should still use `SET LOCAL app.tenant_id` for all child tables.
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE planning_areas FORCE ROW LEVEL SECURITY;
ALTER TABLE affected_zones FORCE ROW LEVEL SECURITY;
ALTER TABLE routes FORCE ROW LEVEL SECURITY;
ALTER TABLE ics_form_instances FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
