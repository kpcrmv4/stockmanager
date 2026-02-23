-- Add VIP flag to deposits table
-- VIP deposits have no expiry date (ฝากได้ไม่มีหมดอายุ)
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT false;

-- Index for filtering VIP deposits
CREATE INDEX IF NOT EXISTS idx_deposits_is_vip ON deposits(is_vip) WHERE is_vip = true;

-- Add "no deposit" flag for cases where customer doesn't want to deposit
-- These items are created with status='expired' immediately, ready for transfer to HQ
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS is_no_deposit BOOLEAN DEFAULT false;

-- Partial index for filtering no-deposit items
CREATE INDEX IF NOT EXISTS idx_deposits_is_no_deposit ON deposits(is_no_deposit) WHERE is_no_deposit = true;
