-- 00023_commission_cancellation_and_bottle_product.sql
--
-- 1. Soft-cancel for commission entries (recorded but not yet paid).
--    Cancelled entries stay in the table for the history tab and audit trail
--    but are excluded from active totals and from "unpaid" lists. They can
--    be restored as long as they haven't been linked to a payment.
--
-- 2. Persist the bottle product picked at entry time. We store both the
--    foreign key (for joins) AND a denormalized name + category so the
--    historical record survives product renames/deletes.

ALTER TABLE commission_entries
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by      UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cancel_reason     TEXT,
  ADD COLUMN IF NOT EXISTS bottle_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bottle_product_name     TEXT,
  ADD COLUMN IF NOT EXISTS bottle_product_category TEXT;

CREATE INDEX IF NOT EXISTS idx_commission_entries_cancelled
  ON commission_entries(cancelled_at)
  WHERE cancelled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_entries_active
  ON commission_entries(store_id, bill_date)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commission_entries_bottle_product
  ON commission_entries(bottle_product_id)
  WHERE bottle_product_id IS NOT NULL;
