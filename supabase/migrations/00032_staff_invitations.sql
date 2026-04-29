-- 00032_staff_invitations.sql
--
-- Replace per-store `staff_registration_code` with per-invitation tokens.
-- Owner/manager creates invitation links specifying role + store. Staff
-- registers via /invite/{token}. Owner can disable individual links via
-- the active flag without rotating a shared code.
--
-- New table:
--   staff_invitations — one row per generated link
--
-- Removed:
--   store_settings.staff_registration_code column

CREATE TABLE IF NOT EXISTS staff_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT UNIQUE NOT NULL,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  used_count  INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_token
  ON staff_invitations(token) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_staff_invitations_store
  ON staff_invitations(store_id);

ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;

-- Owner/manager (admin) can see + manage invitations for any store.
-- Manager scope is intentionally permissive within a single-tenant install.
CREATE POLICY "Admin manage staff invitations" ON staff_invitations
  FOR ALL USING (is_admin() OR get_user_role() = 'manager')
  WITH CHECK (is_admin() OR get_user_role() = 'manager');

-- Drop the legacy registration code column. Old data is discarded
-- intentionally — codes were short-lived and users were already migrated.
ALTER TABLE store_settings DROP COLUMN IF EXISTS staff_registration_code;
