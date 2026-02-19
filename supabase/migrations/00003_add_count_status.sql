-- เพิ่ม count_status สำหรับควบคุมว่าสินค้าต้องนับสต๊อกหรือไม่
-- 'active' = นับปกติ, 'excluded' = ยกเว้นการนับ
-- คนละส่วนกับ active (boolean) ที่ควบคุมว่าสินค้ายังใช้งานอยู่ไหม

ALTER TABLE products
ADD COLUMN IF NOT EXISTS count_status TEXT NOT NULL DEFAULT 'active';

-- เพิ่ม check constraint
ALTER TABLE products
ADD CONSTRAINT products_count_status_check
CHECK (count_status IN ('active', 'excluded'));
