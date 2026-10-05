-- 0005 — auth lifecycle: user status, session revocation, invitations & resets
--
-- Builds the real login system on top of the multi-tenant core:
--   • users gain a lifecycle (active/invited/disabled), lockout counters, and a
--     `token_version` used to revoke already-issued JWTs server-side.
--   • auth_tokens backs admin invites, password resets, and email verification —
--     only the SHA-256 hash of each token is stored; the raw token lives only in
--     the emailed link.
--   • SECURITY DEFINER helpers do the two unavoidable pre-auth, cross-tenant
--     lookups (token consumption + district search) safely, like the login helper.
--
-- Idempotent; safe to re-run. New tables inherit grants to mitiga_app via the
-- ALTER DEFAULT PRIVILEGES set in 0004.

-- ---------------------------------------------------------------------------
-- User lifecycle + security columns
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_version       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_login_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until        timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at       timestamptz;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_status_chk
    CHECK (status IN ('active', 'invited', 'disabled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- auth_tokens — invites / password resets / email verification
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  purpose         text NOT NULL CHECK (purpose IN ('invite', 'password_reset', 'email_verify')),
  email           citext NOT NULL,
  token_hash      text NOT NULL UNIQUE,          -- SHA-256 of the raw token
  role            membership_role,               -- invite only
  organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE, -- invite only
  user_id         uuid REFERENCES users (id) ON DELETE CASCADE,         -- reset/verify target
  created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_tokens_tenant_idx ON auth_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS auth_tokens_email_idx  ON auth_tokens (tenant_id, email);

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY auth_tokens_all ON auth_tokens
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Pre-auth SECURITY DEFINER helpers (cross-tenant, like lookup_user_for_login).
-- Consuming an invite/reset link happens BEFORE the user has a session, so it
-- can't run under app.tenant_id — these bypass RLS for that one narrow lookup.
-- ---------------------------------------------------------------------------

-- Resolve a token by its hash. Returns nothing for unknown/expired/consumed.
CREATE OR REPLACE FUNCTION public.lookup_auth_token(p_token_hash text)
RETURNS TABLE (
  id uuid, tenant_id uuid, purpose text, email citext,
  role membership_role, organization_id uuid, user_id uuid, expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.tenant_id, t.purpose, t.email, t.role, t.organization_id, t.user_id, t.expires_at
  FROM auth_tokens t
  WHERE t.token_hash = p_token_hash
    AND t.consumed_at IS NULL
    AND t.expires_at > now();
$$;
REVOKE ALL ON FUNCTION public.lookup_auth_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_auth_token(text) TO mitiga_app;

-- District picker: prefix search over tenants (name or slug). Capped + requires
-- a query so it can't be used to enumerate the whole customer list at once.
CREATE OR REPLACE FUNCTION public.search_tenants(p_query text)
RETURNS TABLE (id uuid, name text, slug citext)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.slug
  FROM tenants t
  WHERE length(btrim(p_query)) >= 2
    AND (t.name ILIKE btrim(p_query) || '%' OR t.slug ILIKE btrim(p_query) || '%')
  ORDER BY t.name
  LIMIT 10;
$$;
REVOKE ALL ON FUNCTION public.search_tenants(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_tenants(text) TO mitiga_app;

-- Backfill: existing rows are already-active accounts.
UPDATE users SET status = 'active' WHERE status IS NULL;
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
