-- Add VIP flag to deposits table
-- VIP deposits have no expiry date (ฝากได้ไม่มีหมดอายุ)
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false;

-- Index for filtering VIP deposits
CREATE INDEX IF NOT EXISTS idx_deposits_is_vip ON deposits(is_vip) WHERE is_vip = true;
