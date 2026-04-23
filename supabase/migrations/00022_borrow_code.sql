-- ==========================================
-- Migration: Human-readable borrow reference code
-- ==========================================
-- Adds `borrow_code` column (e.g. `BRW-{FROM_STORE}-{TO_STORE}-XXXXX`) so the
-- borrow reference displayed in chat / UI / notifications is meaningful
-- instead of a raw UUID.
--
-- Format: `BRW-{from_store_code}-{to_store_code}-{5 upper-hex chars}`.
-- Uniqueness is enforced at the DB level; the API generates the code at insert
-- time (mirroring the `deposit_code` pattern used for deposits).

-- 1) Add column (nullable first so we can backfill existing rows)
ALTER TABLE public.borrows
  ADD COLUMN IF NOT EXISTS borrow_code TEXT;

-- 2) Backfill existing rows using store codes + first 5 chars of the UUID.
--    Stores without a `store_code` fall back to `XXX` so the backfill never
--    fails; those rows can be patched later if any exist.
UPDATE public.borrows b
SET borrow_code = CONCAT(
  'BRW-',
  COALESCE(sf.store_code, 'XXX'),
  '-',
  COALESCE(st.store_code, 'XXX'),
  '-',
  UPPER(SUBSTRING(b.id::text FROM 1 FOR 5))
)
FROM public.stores sf, public.stores st
WHERE b.from_store_id = sf.id
  AND b.to_store_id = st.id
  AND b.borrow_code IS NULL;

-- Belt-and-braces for any rows whose stores got deleted
UPDATE public.borrows
SET borrow_code = CONCAT('BRW-LEGACY-', UPPER(SUBSTRING(id::text FROM 1 FOR 5)))
WHERE borrow_code IS NULL;

-- 3) Enforce uniqueness going forward
CREATE UNIQUE INDEX IF NOT EXISTS idx_borrows_borrow_code
  ON public.borrows(borrow_code);
