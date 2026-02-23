-- Add "no deposit" flag for cases where customer doesn't want to deposit
-- These items are created with status='expired' immediately, ready for transfer to HQ
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS is_no_deposit BOOLEAN DEFAULT false;

-- Partial index for filtering no-deposit items
CREATE INDEX IF NOT EXISTS idx_deposits_is_no_deposit ON deposits(is_no_deposit) WHERE is_no_deposit = true;
