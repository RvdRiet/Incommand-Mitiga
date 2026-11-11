-- 0014 — allow custom-role memberships (Phase 2 of configurable RBAC)
--
-- A custom role has no membership_role enum value, so once role_id is authoritative a
-- membership on a custom role carries role_id with role = NULL. Relax the enum column
-- to nullable; it stays set (as a readable mirror) for the built-ins. Resolution always
-- prefers role_id, so a NULL enum is fine. Idempotent.

ALTER TABLE memberships ALTER COLUMN role DROP NOT NULL;
