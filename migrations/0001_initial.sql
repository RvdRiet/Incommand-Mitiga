-- InCommand Mitiga — initial schema + RLS
-- PostgreSQL 15+ with PostGIS

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM (
    'planning',
    'active',
    'demobilization',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE incident_severity AS ENUM (
    'low',
    'moderate',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM (
    'tenant_admin',
    'org_admin',
    'planner',
    'incident_manager',
    'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ics_form_code AS ENUM (
    'ICS_201',
    'ICS_202',
    'ICS_203',
    'ICS_204',
    'ICS_205',
    'ICS_206',
    'ICS_213',
    'ICS_214'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug citext UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizations_tenant_idx ON organizations (tenant_id);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email citext NOT NULL,
  name text,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX users_tenant_idx ON users (tenant_id);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX memberships_tenant_idx ON memberships (tenant_id);
CREATE INDEX memberships_org_idx ON memberships (organization_id);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  status incident_status NOT NULL DEFAULT 'planning',
  severity incident_severity NOT NULL DEFAULT 'moderate',
  is_exercise boolean NOT NULL DEFAULT false,
  description text,
  centroid geography (Point, 4326),
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incidents_tenant_updated_idx ON incidents (tenant_id, updated_at DESC);
CREATE INDEX incidents_org_idx ON incidents (organization_id);

CREATE TABLE operational_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  number int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (incident_id, number)
);

CREATE INDEX operational_periods_tenant_idx ON operational_periods (tenant_id);

CREATE TABLE planning_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  label text,
  geom geometry (MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX planning_areas_tenant_idx ON planning_areas (tenant_id);
CREATE INDEX planning_areas_geom_idx ON planning_areas USING GIST (geom);

CREATE TABLE affected_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  label text,
  kind text NOT NULL CHECK (kind IN ('polygon', 'circle')),
  geom geometry (MultiPolygon, 4326),
  center geography (Point, 4326),
  radius_meters double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affected_zones_shape_chk CHECK (
    (kind = 'polygon' AND geom IS NOT NULL)
    OR (kind = 'circle' AND center IS NOT NULL AND radius_meters IS NOT NULL)
  )
);

CREATE INDEX affected_zones_tenant_idx ON affected_zones (tenant_id);
CREATE INDEX affected_zones_geom_idx ON affected_zones USING GIST (geom);

CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  label text,
  geom geometry (MultiLineString, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX routes_tenant_idx ON routes (tenant_id);
CREATE INDEX routes_geom_idx ON routes USING GIST (geom);

CREATE TABLE ics_form_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  operational_period_id uuid REFERENCES operational_periods (id) ON DELETE SET NULL,
  code ics_form_code NOT NULL,
  schema_version int NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ics_form_instances_tenant_idx ON ics_form_instances (tenant_id);
CREATE INDEX ics_form_instances_incident_idx ON ics_form_instances (incident_id);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users (id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_tenant_created_idx ON audit_log (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE affected_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ics_form_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Tenants: single-tenant visibility (user sees only their tenant row)
CREATE POLICY tenants_select ON tenants
  FOR SELECT USING (id = current_setting('app.tenant_id', true)::uuid);

-- Organizations
CREATE POLICY organizations_all ON organizations
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Users in tenant
CREATE POLICY users_all ON users
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Memberships
CREATE POLICY memberships_all ON memberships
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Incidents
CREATE POLICY incidents_all ON incidents
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Operational periods
CREATE POLICY operational_periods_all ON operational_periods
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Planning areas
CREATE POLICY planning_areas_all ON planning_areas
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Affected zones
CREATE POLICY affected_zones_all ON affected_zones
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Routes
CREATE POLICY routes_all ON routes
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ICS forms
CREATE POLICY ics_form_instances_all ON ics_form_instances
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Audit log (append + read within tenant)
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
