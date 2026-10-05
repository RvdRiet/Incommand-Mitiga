-- 0003 — offline-sync state document + blob registry
-- Backs the local-first sync layer: the client edits an incident's operational
-- state offline (Dexie/IndexedDB) and flushes it here; blobs (PDFs, photos,
-- video) live in S3/MinIO with their metadata registered below.

-- ---------------------------------------------------------------------------
-- incident_state — the full operational state of an incident as one JSON doc.
-- `rev` is a monotonic version for optimistic concurrency: a client sends the
-- rev it based its change on; the server rejects stale writes (409) so the
-- client can pull + merge.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_state (
  incident_id uuid PRIMARY KEY REFERENCES incidents (id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev         bigint NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS incident_state_tenant_idx ON incident_state (tenant_id);

-- ---------------------------------------------------------------------------
-- blobs — registry for objects stored in S3/MinIO. The bytes live in the
-- bucket; this row is the queryable metadata + tenant scoping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  incident_id  uuid REFERENCES incidents (id) ON DELETE SET NULL,
  bucket       text NOT NULL,
  object_key   text NOT NULL,
  content_type text,
  size_bytes   bigint,
  kind         text, -- 'ics_pdf' | 'photo' | 'video' | 'attachment' | ...
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS blobs_tenant_idx ON blobs (tenant_id);
CREATE INDEX IF NOT EXISTS blobs_incident_idx ON blobs (incident_id);

-- ---------------------------------------------------------------------------
-- RLS — same tenant-isolation posture as the rest of the schema (0001/0002).
-- ---------------------------------------------------------------------------
ALTER TABLE incident_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_state FORCE ROW LEVEL SECURITY;
ALTER TABLE blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blobs FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY incident_state_all ON incident_state
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY blobs_all ON blobs
    FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
