-- 00034_profiles_must_change_password.sql
--
-- Track whether a user's password is still the default (set during admin
-- reset). UI shows a persistent banner until the user changes it. Cleared
-- via /api/me/change-password.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
