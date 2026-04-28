-- ============================================================================
-- 00031_pending_staff_deposit_flow.sql
-- ============================================================================
-- Unify the customer-LIFF deposit-request flow into the main `deposits` table.
--
-- Before: customer requests lived in a separate `deposit_requests` table; staff
--         approval inserted a fresh `deposits` row (status='pending_confirm').
-- After:  customer LIFF inserts directly into `deposits` with the new
--         status='pending_staff' (placeholder product/qty=0). Staff fills the
--         product + qty when physically receiving and the SAME row transitions
--         to 'pending_confirm', then 'in_store' once bar verifies.
--
-- This matches the legacy GAS shape (single Deposits sheet) so the
-- `import-deposits` settings page works against either source consistently.
--
-- Steps:
--   1. Add `pending_staff` to deposit_status enum (before pending_confirm).
--   2. Add `cancelled` to deposit_status enum (staff-rejected requests).
--   3. Backfill any pending rows from `deposit_requests` → `deposits`.
--   4. Drop the now-unused `deposit_requests` table.
-- ============================================================================

-- 1 + 2: extend the enum
ALTER TYPE deposit_status ADD VALUE IF NOT EXISTS 'pending_staff' BEFORE 'pending_confirm';
ALTER TYPE deposit_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 3: backfill — only if the legacy table still exists. Wrap in a DO block so
-- the migration is safe to run on installs that never had the table (fresh
-- installs from 00031+).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deposit_requests'
  ) THEN
    INSERT INTO deposits (
      deposit_code, store_id, line_user_id, customer_name, customer_phone,
      product_name, quantity, remaining_qty, remaining_percent, table_number,
      notes, customer_photo_url, status, created_at
    )
    SELECT
      'DEP-' || COALESCE((SELECT store_code FROM stores WHERE id = dr.store_id), 'X')
        || '-' || UPPER(SUBSTRING(REPLACE(dr.id::text, '-', '') FROM 1 FOR 5)),
      dr.store_id, dr.line_user_id, dr.customer_name, dr.customer_phone,
      '', 0, 0, 100, dr.table_number,
      dr.notes, dr.customer_photo_url, 'pending_staff'::deposit_status, dr.created_at
    FROM deposit_requests dr
    WHERE dr.status = 'pending'
    ON CONFLICT (deposit_code) DO NOTHING;
  END IF;
END $$;

-- 4: drop the legacy table (CASCADE removes any leftover RLS/indexes/etc.).
DROP TABLE IF EXISTS deposit_requests CASCADE;
