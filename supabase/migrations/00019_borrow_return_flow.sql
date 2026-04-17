-- ==========================================
-- Migration: Add borrow return flow
-- ==========================================
-- เพิ่ม status 'returned' สำหรับยืนยันการคืนสินค้า
-- เพิ่ม columns สำหรับเก็บข้อมูลการคืน

-- 1. เพิ่ม 'returned' ใน borrow_status enum
ALTER TYPE borrow_status ADD VALUE IF NOT EXISTS 'returned' AFTER 'completed';

-- 2. เพิ่ม columns สำหรับ return flow
ALTER TABLE borrows
  ADD COLUMN IF NOT EXISTS return_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS return_confirmed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS return_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_notes TEXT;
