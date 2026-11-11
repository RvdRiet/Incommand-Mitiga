-- 0018 — tenant first-run setup flag (Setup wizard, Personnel Hub phase 3)
--
-- A fresh tenant is gated into a /setup wizard (org basics → roles → personnel) until
-- the essentials are done. New tenants default to not-complete; existing tenants are
-- backfilled to complete so they are never retro-gated. Also grants the app role the
-- ability to UPDATE its own tenant row (name + flag) — previously SELECT-only.
-- Idempotent; runs as superuser.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_complete boolean NOT NULL DEFAULT false;

-- Existing tenants are already up and running — never send them to the wizard.
UPDATE tenants SET setup_complete = true WHERE setup_complete = false;

-- Let the app role update its own tenant row (name, setup flag) within withTenant.
-- tenants has only a SELECT policy from 0001; add a scoped UPDATE policy.
DO $$ BEGIN
  CREATE POLICY tenants_update ON tenants
    FOR UPDATE USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
