-- 0015 — per-user module overrides (Phase 3 of configurable RBAC)
--
-- A person's effective module access = their role's allow-list, plus any per-user
-- grants, minus any per-user denials. One row per (user, module) that DIFFERS from the
-- role default; no row = inherit the role. `effect` is 'allow' or 'deny'. The always-on
-- Overview dashboard can never be denied (enforced in code). Idempotent.

CREATE TABLE IF NOT EXISTS membership_module_overrides (
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module_slug text NOT NULL,
  effect      text NOT NULL CHECK (effect IN ('allow', 'deny')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, module_slug)
);

CREATE INDEX IF NOT EXISTS mmo_tenant_idx ON membership_module_overrides (tenant_id);

ALTER TABLE membership_module_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_module_overrides FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY mmo_all ON membership_module_overrides
    FOR ALL USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
