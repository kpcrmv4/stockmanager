-- ==========================================
-- Performance & Security Optimization Migration
-- Fixes: missing FK indexes, RLS initplan, search_path, RLS coverage
-- ==========================================

-- ==========================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- (Supabase Advisor: 34 unindexed foreign keys)
-- ==========================================

-- transfers (0% index usage, 72 seq scans)
CREATE INDEX IF NOT EXISTS idx_transfers_from_store ON transfers(from_store_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_store ON transfers(to_store_id);
CREATE INDEX IF NOT EXISTS idx_transfers_deposit ON transfers(deposit_id);
CREATE INDEX IF NOT EXISTS idx_transfers_confirmed_by ON transfers(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_transfers_requested_by ON transfers(requested_by);

-- deposits composite (bar-approval + cron query patterns)
CREATE INDEX IF NOT EXISTS idx_deposits_store_status ON deposits(store_id, status);
CREATE INDEX IF NOT EXISTS idx_deposits_received_by ON deposits(received_by);

-- ocr tables (0% index usage)
CREATE INDEX IF NOT EXISTS idx_ocr_logs_store ON ocr_logs(store_id);

-- penalties (0% index usage)
CREATE INDEX IF NOT EXISTS idx_penalties_store ON penalties(store_id);
CREATE INDEX IF NOT EXISTS idx_penalties_staff ON penalties(staff_id);

-- chat tables
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON chat_rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_chat_pinned_messages_pinned_by ON chat_pinned_messages(pinned_by);
CREATE INDEX IF NOT EXISTS idx_chat_pinned_messages_message ON chat_pinned_messages(message_id);

-- other missing FK indexes
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_store ON notifications(store_id);
CREATE INDEX IF NOT EXISTS idx_hq_deposits_deposit ON hq_deposits(deposit_id);
CREATE INDEX IF NOT EXISTS idx_hq_deposits_received_by ON hq_deposits(received_by);
CREATE INDEX IF NOT EXISTS idx_hq_deposits_withdrawn_by ON hq_deposits(withdrawn_by);
CREATE INDEX IF NOT EXISTS idx_manual_counts_user ON manual_counts(user_id);
CREATE INDEX IF NOT EXISTS idx_borrows_approved_by ON borrows(approved_by);
CREATE INDEX IF NOT EXISTS idx_borrows_requested_by ON borrows(requested_by);
CREATE INDEX IF NOT EXISTS idx_borrows_rejected_by ON borrows(rejected_by);
CREATE INDEX IF NOT EXISTS idx_borrows_borrower_pos ON borrows(borrower_pos_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_borrows_lender_pos ON borrows(lender_pos_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_print_queue_deposit ON print_queue(deposit_id);
CREATE INDEX IF NOT EXISTS idx_print_queue_requested_by ON print_queue(requested_by);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON profiles(created_by);
CREATE INDEX IF NOT EXISTS idx_stores_manager ON stores(manager_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_user_stores_store ON user_stores(store_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_granted_by ON user_permissions(granted_by);
CREATE INDEX IF NOT EXISTS idx_comparisons_approved_by ON comparisons(approved_by);
CREATE INDEX IF NOT EXISTS idx_comparisons_explained_by ON comparisons(explained_by);

-- ==========================================
-- 2. FIX RLS auth_rls_initplan WARNINGS
-- Wrap auth.uid() in (SELECT auth.uid()) to evaluate once per query
-- ==========================================

-- profiles
DROP POLICY IF EXISTS "Users view own profile" ON profiles;
CREATE POLICY "Users view own profile" ON profiles FOR SELECT
  USING (id = (SELECT auth.uid()));

-- user_stores
DROP POLICY IF EXISTS "Users see own assignments" ON user_stores;
CREATE POLICY "Users see own assignments" ON user_stores FOR SELECT
  USING (user_id = (SELECT auth.uid()) OR is_admin());

-- push_subscriptions
DROP POLICY IF EXISTS "Users see own subscriptions" ON push_subscriptions;
CREATE POLICY "Users see own subscriptions" ON push_subscriptions FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users manage own subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage own subscriptions" ON push_subscriptions FOR ALL
  USING (user_id = (SELECT auth.uid()));

-- deposits
DROP POLICY IF EXISTS "Customer see own deposits" ON deposits;
CREATE POLICY "Customer see own deposits" ON deposits FOR SELECT
  USING (
    customer_id = (SELECT auth.uid())
    OR line_user_id = (SELECT profiles.line_user_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  );

-- withdrawals
DROP POLICY IF EXISTS "Customer see own withdrawals" ON withdrawals;
CREATE POLICY "Customer see own withdrawals" ON withdrawals FOR SELECT
  USING (
    line_user_id = (SELECT profiles.line_user_id FROM profiles WHERE profiles.id = (SELECT auth.uid()))
  );

-- notifications
DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications" ON notifications FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE
  USING (user_id = (SELECT auth.uid()));

-- notification_preferences
DROP POLICY IF EXISTS "Users see own preferences" ON notification_preferences;
CREATE POLICY "Users see own preferences" ON notification_preferences FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users manage own preferences" ON notification_preferences;
CREATE POLICY "Users manage own preferences" ON notification_preferences FOR ALL
  USING (user_id = (SELECT auth.uid()));

-- user_permissions
DROP POLICY IF EXISTS "Users see own permissions" ON user_permissions;
CREATE POLICY "Users see own permissions" ON user_permissions FOR SELECT
  USING (user_id = (SELECT auth.uid()) OR is_admin());

-- chat_members
DROP POLICY IF EXISTS "Members update own read status" ON chat_members;
CREATE POLICY "Members update own read status" ON chat_members FOR UPDATE
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Members can update own membership" ON chat_members;
CREATE POLICY "Members can update own membership" ON chat_members FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can add members" ON chat_members;
CREATE POLICY "Admins can add members" ON chat_members FOR INSERT
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = chat_members.room_id
        AND cm.user_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )) OR user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Admins can remove members" ON chat_members;
CREATE POLICY "Admins can remove members" ON chat_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = chat_members.room_id
        AND cm.user_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )
  );

-- chat_messages
DROP POLICY IF EXISTS "Members send chat messages" ON chat_messages;
CREATE POLICY "Members send chat messages" ON chat_messages FOR INSERT
  WITH CHECK (sender_id = (SELECT auth.uid()) AND is_chat_member(room_id));

-- chat_rooms
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON chat_rooms;
CREATE POLICY "Authenticated users can create rooms" ON chat_rooms FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins can update rooms" ON chat_rooms;
CREATE POLICY "Admins can update rooms" ON chat_rooms FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_rooms.id
        AND chat_members.user_id = (SELECT auth.uid())
        AND chat_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_rooms.id
        AND chat_members.user_id = (SELECT auth.uid())
        AND chat_members.role = 'admin'
    )
  );

-- chat_pinned_messages
DROP POLICY IF EXISTS "Admins can pin messages" ON chat_pinned_messages;
CREATE POLICY "Admins can pin messages" ON chat_pinned_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_pinned_messages.room_id
        AND chat_members.user_id = (SELECT auth.uid())
        AND (
          chat_members.role = 'admin'
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('owner', 'manager')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Admins can unpin messages" ON chat_pinned_messages;
CREATE POLICY "Admins can unpin messages" ON chat_pinned_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_pinned_messages.room_id
        AND chat_members.user_id = (SELECT auth.uid())
        AND (
          chat_members.role = 'admin'
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
              AND profiles.role IN ('owner', 'manager')
          )
        )
    )
  );

-- ==========================================
-- 3. FIX FUNCTION search_path
-- (Supabase Advisor: 15 functions with mutable search_path)
-- ==========================================

-- Recreate functions with public. schema prefix + SET search_path = ''
-- (ALTER FUNCTION SET search_path alone is not enough — function body
--  must use public.table_name when search_path is empty)

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'accountant', 'hq')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION get_user_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM public.user_stores WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION is_chat_member(p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION is_action_card_timed_out(p_metadata JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_metadata->>'status' != 'claimed' THEN RETURN false; END IF;
  IF p_metadata->>'claimed_at' IS NULL OR p_metadata->>'timeout_minutes' IS NULL THEN RETURN false; END IF;
  RETURN (
    (p_metadata->>'claimed_at')::timestamptz
    + ((p_metadata->>'timeout_minutes')::int * interval '1 minute')
    < now()
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = '';

CREATE OR REPLACE FUNCTION auto_release_timed_out(p_metadata JSONB)
RETURNS JSONB AS $$
BEGIN
  RETURN p_metadata || jsonb_build_object(
    'status', 'pending', 'claimed_by', null, 'claimed_by_name', null,
    'claimed_at', null, 'auto_released', true, 'auto_released_at', now()
  );
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE OR REPLACE FUNCTION create_store_chat_room()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.chat_rooms (store_id, name, type)
  VALUES (NEW.id, NEW.store_name || ' — แชท', 'store');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION add_user_to_store_chat()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.chat_members (room_id, user_id, role)
  SELECT cr.id, NEW.user_id, 'member'
  FROM public.chat_rooms cr
  WHERE cr.store_id = NEW.store_id AND cr.type = 'store' AND cr.is_active = true
  ON CONFLICT (room_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION remove_user_from_store_chat()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.chat_members
  WHERE user_id = OLD.user_id
    AND room_id IN (SELECT cr.id FROM public.chat_rooms cr WHERE cr.store_id = OLD.store_id AND cr.type = 'store');
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION insert_bot_message(
  p_room_id UUID, p_type chat_message_type, p_content TEXT, p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.chat_messages (room_id, sender_id, type, content, metadata)
  VALUES (p_room_id, NULL, p_type, p_content, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION claim_action_card(p_message_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages; v_meta JSONB; v_profile RECORD;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Message not found'); END IF;
  IF v_msg.type != 'action_card' THEN RETURN jsonb_build_object('success', false, 'error', 'Not an action card'); END IF;
  v_meta := v_msg.metadata;
  IF v_meta->>'status' = 'claimed' AND is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  END IF;
  IF v_meta->>'status' != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed', 'claimed_by', v_meta->>'claimed_by_name');
  END IF;
  SELECT display_name, username INTO v_profile FROM public.profiles WHERE id = p_user_id;
  v_meta := v_meta || jsonb_build_object('status', 'claimed', 'claimed_by', p_user_id, 'claimed_by_name', COALESCE(v_profile.display_name, v_profile.username), 'claimed_at', now(), 'auto_released', null, 'auto_released_at', null);
  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION release_action_card(p_message_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages; v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Message not found'); END IF;
  v_meta := v_msg.metadata;
  IF v_meta->>'status' = 'claimed' AND is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
    RETURN jsonb_build_object('success', true, 'metadata', v_meta);
  END IF;
  IF v_meta->>'claimed_by' != p_user_id::text THEN RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you'); END IF;
  v_meta := v_meta || jsonb_build_object('status', 'pending', 'claimed_by', null, 'claimed_by_name', null, 'claimed_at', null, 'released_by', p_user_id, 'released_at', now());
  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION complete_action_card(p_message_id UUID, p_user_id UUID, p_notes TEXT DEFAULT NULL, p_photo_url TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages; v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Message not found'); END IF;
  v_meta := v_msg.metadata;
  IF v_meta->>'status' != 'claimed' THEN RETURN jsonb_build_object('success', false, 'error', 'Not in claimed status'); END IF;
  IF is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
    RETURN jsonb_build_object('success', false, 'error', 'หมดเวลาแล้ว', 'metadata', v_meta, 'timed_out', true);
  END IF;
  IF v_meta->>'claimed_by' != p_user_id::text THEN RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you'); END IF;
  v_meta := v_meta || jsonb_build_object('status', 'completed', 'completed_at', now(), 'completion_notes', p_notes, 'confirmation_photo_url', p_photo_url);
  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION get_chat_unread_counts(p_user_id UUID)
RETURNS TABLE(room_id UUID, unread_count BIGINT) AS $$
  SELECT cm.room_id, COUNT(msg.id) AS unread_count
  FROM public.chat_members cm
  LEFT JOIN public.chat_messages msg
    ON msg.room_id = cm.room_id AND msg.created_at > cm.last_read_at
    AND msg.sender_id != p_user_id AND msg.archived_at IS NULL
  WHERE cm.user_id = p_user_id
  GROUP BY cm.room_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

-- ==========================================
-- 4. ENABLE RLS ON UNPROTECTED TABLES
-- ==========================================

-- audit_logs: enable RLS, only service role can write, admins can read
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin see audit_logs" ON audit_logs;
CREATE POLICY "Admin see audit_logs" ON audit_logs FOR SELECT
  USING (is_admin());

-- app_settings: enable RLS, admins only
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read app_settings" ON app_settings FOR SELECT
  USING (is_admin());
CREATE POLICY "Admin write app_settings" ON app_settings FOR ALL
  USING (is_admin());

-- ==========================================
-- 5. FIX DEPOSIT_REQUESTS ALWAYS-TRUE INSERT POLICY
-- ==========================================

DROP POLICY IF EXISTS "Anyone insert deposit_requests" ON deposit_requests;
CREATE POLICY "Authenticated insert deposit_requests" ON deposit_requests FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
