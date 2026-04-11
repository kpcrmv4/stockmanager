-- ==========================================
-- 00018 — DAVIS Ai Central Config + Per-store LINE refactor
--
-- Changes:
--   1. Create `system_settings` (global key-value) to hold:
--      - davis_ai.bot_name        — display name (default: "DAVIS Ai")
--      - davis_ai.liff_id         — ONE shared LIFF id (replaces NEXT_PUBLIC_LIFF_ID env)
--      - davis_ai.webhook_note    — optional instructions shown in UI
--   2. Keep `stores.line_token` / `line_channel_id` / `line_channel_secret`
--      (per-store OA credentials — staff will now enter these via UI).
--   3. Drop previous per-store LIFF assumption (no dedicated column needed;
--      LIFF URL is computed as liff.line.me/{central_liff_id}?store={store_code}).
--   4. Seed default system settings row.
-- ==========================================

-- 1. system_settings table (simple key-value store for global config)
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES profiles(id)
);

COMMENT ON TABLE system_settings IS
  'Global key-value settings (DAVIS Ai central bot config, feature flags, etc.)';

-- 2. Seed default rows (ON CONFLICT = no-op on re-run)
INSERT INTO system_settings (key, value, description)
VALUES
  ('davis_ai.bot_name',     'DAVIS Ai', 'Display name for the central bot (shown in UI)'),
  ('davis_ai.liff_id',      '',         'LIFF ID ที่ใช้ร่วมกันทุกสาขา — ใส่ ?store=storeCode ใน URL เพื่อระบุสาขา'),
  ('davis_ai.webhook_note', '',         'Extra note shown on DAVIS Ai settings page (optional)')
ON CONFLICT (key) DO NOTHING;

-- 3. RLS — owner only can read/write
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_system_settings"
  ON system_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'owner'
    )
  );

CREATE POLICY "owner_write_system_settings"
  ON system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'owner'
    )
  );

-- 4. Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION system_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS system_settings_updated_at ON system_settings;
CREATE TRIGGER system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION system_settings_touch_updated_at();
