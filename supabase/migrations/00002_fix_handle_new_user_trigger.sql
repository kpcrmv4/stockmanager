-- ==========================================
-- Fix: handle_new_user trigger ที่ fail เมื่อสร้าง user จาก Supabase Dashboard
--
-- สาเหตุปัญหาเดิม:
-- 1. username เป็น NULL เมื่อไม่มี metadata.username และ email เป็น NULL
-- 2. role cast ล้มเหลวเมื่อ metadata.role ไม่ตรง enum
-- 3. username ซ้ำ (UNIQUE violation)
-- ==========================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username TEXT;
  _role user_role;
BEGIN
  -- ดึง username จาก metadata หรือ email หรือสร้างจาก UUID
  _username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(NEW.email), ''),
    'user_' || REPLACE(NEW.id::TEXT, '-', '')
  );

  -- ถ้า username ซ้ำ ให้ต่อท้ายด้วย 6 ตัวแรกของ UUID
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = _username) THEN
    _username := _username || '_' || SUBSTR(REPLACE(NEW.id::TEXT, '-', ''), 1, 6);
  END IF;

  -- แปลง role จาก metadata (ถ้า invalid ให้ใช้ 'staff')
  BEGIN
    _role := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '')::user_role,
      'staff'
    );
  EXCEPTION WHEN invalid_text_representation OR others THEN
    _role := 'staff';
  END;

  INSERT INTO public.profiles (id, username, role)
  VALUES (NEW.id, _username, _role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error แต่ไม่ block การสร้าง auth user
  RAISE WARNING 'handle_new_user: failed to create profile for user % — %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
