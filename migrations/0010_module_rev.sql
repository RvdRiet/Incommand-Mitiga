-- 0010 — per-module revision for concurrency.
--
-- Each module slice gets its own monotonic rev so two people editing DIFFERENT
-- modules never conflict; only concurrent edits to the SAME module rebase. The
-- incident-level rev in incident_state remains as a whole-doc fallback for
-- clients that don't send per-module revs.
ALTER TABLE incident_module_state
  ADD COLUMN IF NOT EXISTS rev bigint NOT NULL DEFAULT 1;
