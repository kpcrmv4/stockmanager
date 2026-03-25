-- Add 'cancelled' to borrow_status enum
ALTER TYPE borrow_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Add cancel tracking columns
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id);
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Index for cancelled_by
CREATE INDEX IF NOT EXISTS idx_borrows_cancelled_by ON borrows(cancelled_by);
