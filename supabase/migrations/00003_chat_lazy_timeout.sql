-- ==========================================
-- StockManager — Chat Lazy Timeout (Phase 2.3)
-- Auto-release timed-out action cards แบบ lazy (ไม่ต้อง cron)
--
-- Strategy:
--   - ตอน claim: เช็คก่อนว่า card ปัจจุบัน timed out หรือยัง → auto-release
--   - ตอน complete: เช็คว่ายัง timed out หรือยัง → reject ถ้าหมดเวลา
--   - ตอน query: client คำนวณ effective status จาก claimed_at + timeout_minutes
-- ==========================================

-- ==========================================
-- Helper: เช็คว่า action card timed out หรือยัง
-- ==========================================

CREATE OR REPLACE FUNCTION is_action_card_timed_out(p_metadata JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_metadata->>'status' != 'claimed' THEN
    RETURN false;
  END IF;

  IF p_metadata->>'claimed_at' IS NULL OR p_metadata->>'timeout_minutes' IS NULL THEN
    RETURN false;
  END IF;

  RETURN (
    (p_metadata->>'claimed_at')::timestamptz
    + ((p_metadata->>'timeout_minutes')::int * interval '1 minute')
    < now()
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ==========================================
-- Helper: Auto-release timed-out card (returns updated metadata)
-- ==========================================

CREATE OR REPLACE FUNCTION auto_release_timed_out(p_metadata JSONB)
RETURNS JSONB AS $$
BEGIN
  RETURN p_metadata || jsonb_build_object(
    'status', 'pending',
    'claimed_by', null,
    'claimed_by_name', null,
    'claimed_at', null,
    'auto_released', true,
    'auto_released_at', now()
  );
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- UPDATED: Claim action card (with lazy timeout check)
-- ==========================================

CREATE OR REPLACE FUNCTION claim_action_card(
  p_message_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_msg chat_messages;
  v_meta JSONB;
  v_profile RECORD;
BEGIN
  -- ดึงข้อความ
  SELECT * INTO v_msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  IF v_msg.type != 'action_card' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an action card');
  END IF;

  v_meta := v_msg.metadata;

  -- ถ้า claimed แต่หมดเวลา → auto-release ก่อน
  IF v_meta->>'status' = 'claimed' AND is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;
  END IF;

  -- ตรวจสอบ status (หลัง auto-release แล้ว)
  IF v_meta->>'status' != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed',
      'claimed_by', v_meta->>'claimed_by_name');
  END IF;

  -- ดึงชื่อ user
  SELECT display_name, username INTO v_profile
  FROM profiles WHERE id = p_user_id;

  -- อัปเดต metadata
  v_meta := v_meta
    || jsonb_build_object(
      'status', 'claimed',
      'claimed_by', p_user_id,
      'claimed_by_name', COALESCE(v_profile.display_name, v_profile.username),
      'claimed_at', now(),
      'auto_released', null,
      'auto_released_at', null
    );

  UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- UPDATED: Complete action card (with timeout check)
-- ==========================================

CREATE OR REPLACE FUNCTION complete_action_card(
  p_message_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_msg chat_messages;
  v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  v_meta := v_msg.metadata;

  -- ต้อง claimed ก่อนถึง complete ได้
  IF v_meta->>'status' != 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in claimed status');
  END IF;

  -- ถ้าหมดเวลา → auto-release แล้ว reject
  IF is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;
    RETURN jsonb_build_object('success', false, 'error', 'หมดเวลาแล้ว งานถูกปล่อยกลับคิว',
      'metadata', v_meta, 'timed_out', true);
  END IF;

  -- เฉพาะคนที่ claim
  IF v_meta->>'claimed_by' != p_user_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you');
  END IF;

  v_meta := v_meta
    || jsonb_build_object(
      'status', 'completed',
      'completed_at', now(),
      'completion_notes', p_notes,
      'confirmation_photo_url', p_photo_url
    );

  UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- UPDATED: Release action card (allow release of timed-out cards by anyone)
-- ==========================================

CREATE OR REPLACE FUNCTION release_action_card(
  p_message_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_msg chat_messages;
  v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  v_meta := v_msg.metadata;

  -- ถ้าหมดเวลา → ใครก็ release ได้
  IF v_meta->>'status' = 'claimed' AND is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;
    RETURN jsonb_build_object('success', true, 'metadata', v_meta);
  END IF;

  -- เฉพาะคนที่ claim เท่านั้นถึงจะ release ได้ (ถ้ายังไม่หมดเวลา)
  IF v_meta->>'claimed_by' != p_user_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you');
  END IF;

  -- reset กลับเป็น pending
  v_meta := v_meta
    || jsonb_build_object(
      'status', 'pending',
      'claimed_by', null,
      'claimed_by_name', null,
      'claimed_at', null,
      'released_by', p_user_id,
      'released_at', now()
    );

  UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
