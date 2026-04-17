-- ==========================================
-- Migration: Add borrow return flow
-- ==========================================
-- เพิ่ม status 'returned' สำหรับยืนยันการคืนสินค้า
-- เพิ่ม columns สำหรับเก็บข้อมูลการคืน

-- 1. จัดการ borrow_status enum (สร้างใหม่ถ้าไม่มี หรือเพิ่มค่าถ้ามีแล้ว)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'borrow_status') THEN
    CREATE TYPE public.borrow_status AS ENUM ('pending_approval', 'approved', 'pos_adjusting', 'completed', 'returned', 'rejected', 'cancelled');
  ELSE
    ALTER TYPE public.borrow_status ADD VALUE IF NOT EXISTS 'returned' AFTER 'completed';
  END IF;
END $$;

-- 2. เพิ่ม columns สำหรับ return flow
ALTER TABLE public.borrows
  ADD COLUMN IF NOT EXISTS return_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS return_confirmed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS return_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_notes TEXT;
