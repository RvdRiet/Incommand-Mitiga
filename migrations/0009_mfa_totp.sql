-- 0009 — TOTP multi-factor authentication.
--
-- The shared secret is stored ENCRYPTED (AES-256-GCM, key derived from
-- AUTH_SECRET — see src/lib/auth/secrets.ts), never in clear text. `totp_enabled`
-- gates whether a code is required at login.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret  text,
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;
