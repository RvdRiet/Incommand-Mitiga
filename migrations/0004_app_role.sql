-- 0004 — least-privilege application role (multi-tenant production posture)
--
-- WHY: Postgres RLS policies are ONLY enforced for roles that are neither a
-- superuser nor hold BYPASSRLS. The migrations/seed run as the `postgres`
-- superuser (which bypasses RLS by design, so it can create tenants and run
-- DDL), but the running application MUST connect as this non-privileged role
-- so the tenant-isolation policies in 0001/0002/0003 actually take effect.
--
--   • migrations + seed + admin  ->  postgres            (DATABASE_ADMIN_URL)
--   • the Next.js app at runtime ->  mitiga_app          (DATABASE_URL)
--
-- This file is idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- Role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mitiga_app') THEN
    -- NOSUPERUSER + NOBYPASSRLS is the whole point: this role is subject to RLS.
    CREATE ROLE mitiga_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Dev/CI password. In production, rotate this from a secret store instead:
--   ALTER ROLE mitiga_app WITH PASSWORD '<from-secrets-manager>';
-- and point DATABASE_URL at it. Never ship this default to production.
ALTER ROLE mitiga_app WITH PASSWORD 'mitiga_app_dev';

-- ---------------------------------------------------------------------------
-- Privileges on the current schema objects (0001/0003 tables + sequences).
-- The role gets only DML — no DDL, no role/db creation, no ownership.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO mitiga_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mitiga_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mitiga_app;

-- Login lookup is SECURITY DEFINER (runs as owner, bypassing RLS for the
-- credential check) and was REVOKEd from PUBLIC in 0002 — grant it explicitly
-- so sign-in works for the non-privileged app role.
GRANT EXECUTE ON FUNCTION public.lookup_user_for_login(citext, citext) TO mitiga_app;

-- ---------------------------------------------------------------------------
-- Future objects: any table/sequence a later migration creates (as postgres)
-- is automatically granted to the app role, so we never have to revisit this.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mitiga_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mitiga_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO mitiga_app;

-- NOTE: `tenants` has RLS ENABLEd but not FORCEd, and exposes only a SELECT
-- policy (id = app.tenant_id). Under this non-privileged role that means the
-- app can read its own tenant row but CANNOT create/modify tenants — tenant
-- provisioning is deliberately an admin (DATABASE_ADMIN_URL) operation.
