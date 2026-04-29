-- 00038_tutorial_mode.sql
--
-- Sandbox / tutorial mode (stockManager-only experiment).
--
-- Purpose: let staff click "สอนการใช้งาน" and walk through the real
-- deposit-flow form by submitting a real row that is invisible to
-- everyone except the person who created it. After ~24 hours the
-- tutorial rows are cleaned up automatically so they don't pollute
-- reporting / chat logs / printer queue.
--
-- Pattern:
--   1. is_tutorial BOOLEAN flag on deposits / deposit_bottles / withdrawals
--      (other tables stay clean — chat / audit / print are suppressed in
--      app code instead, so no schema change there)
--   2. RLS: tutorial rows are visible only to the creator. Non-tutorial
--      rows behave exactly like before.
--   3. Cleanup function deletes tutorial rows older than 24h. Wire to
--      whatever cron is already running (see /api/cron/audit-cleanup).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE deposits         ADD COLUMN IF NOT EXISTS is_tutorial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE deposit_bottles  ADD COLUMN IF NOT EXISTS is_tutorial BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE withdrawals      ADD COLUMN IF NOT EXISTS is_tutorial BOOLEAN NOT NULL DEFAULT false;

-- Partial index — cheap because tutorial rows are a tiny fraction of total.
-- Used by cleanup_tutorial_rows() and by the per-user "show my tutorial"
-- filter on the deposit list.
CREATE INDEX IF NOT EXISTS idx_deposits_tutorial
  ON deposits(received_by, created_at) WHERE is_tutorial = true;
CREATE INDEX IF NOT EXISTS idx_withdrawals_tutorial
  ON withdrawals(processed_by, created_at) WHERE is_tutorial = true;

-- ---------------------------------------------------------------------------
-- 2. RLS — gate tutorial rows behind ownership
-- ---------------------------------------------------------------------------
-- deposits
DROP POLICY IF EXISTS "Staff see store deposits"    ON deposits;
DROP POLICY IF EXISTS "Customer see own deposits"   ON deposits;
DROP POLICY IF EXISTS "Staff manage store deposits" ON deposits;

CREATE POLICY "Staff see store deposits" ON deposits
  FOR SELECT
  USING (
    (NOT is_tutorial OR received_by = auth.uid())
    AND (store_id IN (SELECT get_user_store_ids()) OR is_admin())
  );

CREATE POLICY "Customer see own deposits" ON deposits
  FOR SELECT
  USING (
    NOT is_tutorial
    AND (
      customer_id = auth.uid()
      OR line_user_id = (SELECT p.line_user_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY "Staff manage store deposits" ON deposits
  FOR ALL
  USING (
    (NOT is_tutorial OR received_by = auth.uid())
    AND (store_id IN (SELECT get_user_store_ids()) OR is_admin())
  );

-- withdrawals
DROP POLICY IF EXISTS "Staff see store withdrawals"  ON withdrawals;
DROP POLICY IF EXISTS "Customer see own withdrawals" ON withdrawals;
DROP POLICY IF EXISTS "Staff manage withdrawals"     ON withdrawals;

CREATE POLICY "Staff see store withdrawals" ON withdrawals
  FOR SELECT
  USING (
    (NOT is_tutorial OR processed_by = auth.uid())
    AND (store_id IN (SELECT get_user_store_ids()) OR is_admin())
  );

CREATE POLICY "Customer see own withdrawals" ON withdrawals
  FOR SELECT
  USING (
    NOT is_tutorial
    AND (
      line_user_id = (SELECT p.line_user_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY "Staff manage withdrawals" ON withdrawals
  FOR ALL
  USING (
    (NOT is_tutorial OR processed_by = auth.uid())
    AND (store_id IN (SELECT get_user_store_ids()) OR is_admin())
  );

-- deposit_bottles — inherit tutorial state from parent deposit
DROP POLICY IF EXISTS "Staff manage bottles via deposit" ON deposit_bottles;
CREATE POLICY "Staff manage bottles via deposit" ON deposit_bottles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deposits d
      WHERE d.id = deposit_bottles.deposit_id
        AND (NOT d.is_tutorial OR d.received_by = auth.uid())
        AND (d.store_id IN (SELECT get_user_store_ids()) OR is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Auto-stamp deposit_bottles.is_tutorial from parent deposit
-- ---------------------------------------------------------------------------
-- The auto-bottle trigger inserts rows without the flag set; mirror it
-- from the parent so RLS / cleanup work without app-layer plumbing.
CREATE OR REPLACE FUNCTION sync_bottle_tutorial_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_tutorial = false THEN
    SELECT is_tutorial INTO NEW.is_tutorial
      FROM public.deposits
     WHERE id = NEW.deposit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_bottle_tutorial ON deposit_bottles;
CREATE TRIGGER trg_sync_bottle_tutorial
  BEFORE INSERT ON deposit_bottles
  FOR EACH ROW EXECUTE FUNCTION sync_bottle_tutorial_flag();

-- ---------------------------------------------------------------------------
-- 4. Cleanup function — invoked by cron
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_tutorial_rows(max_age_hours INTEGER DEFAULT 24)
RETURNS TABLE (deposits_deleted INTEGER, withdrawals_deleted INTEGER) AS $$
DECLARE
  v_dep INTEGER;
  v_wit INTEGER;
BEGIN
  -- bottles cascade via FK ON DELETE on deposits
  WITH del AS (
    DELETE FROM public.deposits
     WHERE is_tutorial = true
       AND created_at < now() - (max_age_hours || ' hours')::interval
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_dep FROM del;

  WITH del AS (
    DELETE FROM public.withdrawals
     WHERE is_tutorial = true
       AND created_at < now() - (max_age_hours || ' hours')::interval
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_wit FROM del;

  RETURN QUERY SELECT v_dep, v_wit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
