-- 0008 — harden RLS policies to fail closed on an EMPTY tenant context.
--
-- `current_setting('app.tenant_id', true)` returns NULL on a fresh connection but
-- an EMPTY STRING ('') on a pooled connection where a transaction-local set has
-- since reverted. '' ::uuid raises an error; nullif(...,'')::uuid makes both
-- cases NULL, so a query with no tenant context cleanly returns zero rows instead
-- of erroring. Recreates every tenant policy with the safer expression.
DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'organizations','users','memberships','incidents','operational_periods',
    'planning_areas','affected_zones','routes','ics_form_instances',
    'incident_state','blobs','auth_tokens','role_permissions','incident_module_state'
  ];
  expr text := 'tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid';
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (%s) WITH CHECK (%s)',
      t || '_all', t, expr, expr
    );
  END LOOP;

  -- tenants: SELECT-only, keyed on id.
  DROP POLICY IF EXISTS tenants_select ON tenants;
  CREATE POLICY tenants_select ON tenants
    FOR SELECT USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

  -- audit_log: append + read within tenant (separate policies).
  DROP POLICY IF EXISTS audit_log_select ON audit_log;
  CREATE POLICY audit_log_select ON audit_log
    FOR SELECT USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  DROP POLICY IF EXISTS audit_log_insert ON audit_log;
  CREATE POLICY audit_log_insert ON audit_log
    FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
END $$;
