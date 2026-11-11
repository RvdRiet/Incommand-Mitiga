-- 0019 — forced password change on first login (RBAC phase 4)
--
-- Admins can now create accounts directly (not just by email invite), handing the
-- user a temporary password. Such accounts are flagged `must_change_password` so the
-- app forces a password change before anything else on first sign-in. Existing users
-- are backfilled to false (they already chose their own password). Idempotent;
-- runs as superuser.

-- The DEFAULT false applies to every existing row, so users already in the system
-- (who chose their own password) are never retro-forced. New admin-created accounts
-- set the flag to true explicitly on INSERT.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
