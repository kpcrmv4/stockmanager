-- Track which specific bottle a withdrawal request applies to.
-- Nullable so the legacy "withdraw N units" flow keeps working for
-- single-bottle deposits and historical rows; multi-bottle deposits
-- now create one withdrawals row per selected bottle so bar approval
-- can mark just those bottles consumed.
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS bottle_id UUID REFERENCES deposit_bottles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_bottle_id ON withdrawals(bottle_id);
