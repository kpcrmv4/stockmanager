-- ==========================================
-- Migration: Borrow return — lender receipt confirmation
-- ==========================================
-- Adds an intermediate status `return_pending` so the lender (store
-- receiving the returned items) must confirm receipt with a photo before
-- the borrow is considered `returned` (done).

-- 1) Add 'return_pending' to borrow_status enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'borrow_status') THEN
    ALTER TYPE public.borrow_status
      ADD VALUE IF NOT EXISTS 'return_pending' BEFORE 'returned';
  END IF;
END $$;

-- 2) Columns for lender's return-receipt confirmation
ALTER TABLE public.borrows
  ADD COLUMN IF NOT EXISTS return_receipt_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS return_received_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS return_received_at TIMESTAMPTZ;
