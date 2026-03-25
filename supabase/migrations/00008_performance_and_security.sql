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

ALTER FUNCTION get_user_role() SET search_path = '';
ALTER FUNCTION is_admin() SET search_path = '';
ALTER FUNCTION get_user_store_ids() SET search_path = '';
ALTER FUNCTION create_store_chat_room() SET search_path = '';
ALTER FUNCTION add_user_to_store_chat() SET search_path = '';
ALTER FUNCTION remove_user_from_store_chat() SET search_path = '';
ALTER FUNCTION insert_bot_message(UUID, chat_message_type, TEXT, JSONB) SET search_path = '';
ALTER FUNCTION claim_action_card(UUID, UUID) SET search_path = '';
ALTER FUNCTION release_action_card(UUID, UUID) SET search_path = '';
ALTER FUNCTION complete_action_card(UUID, UUID, TEXT) SET search_path = '';
ALTER FUNCTION complete_action_card(UUID, UUID, TEXT, TEXT) SET search_path = '';
ALTER FUNCTION is_action_card_timed_out(JSONB) SET search_path = '';
ALTER FUNCTION auto_release_timed_out(JSONB) SET search_path = '';
ALTER FUNCTION get_chat_unread_counts(UUID) SET search_path = '';
ALTER FUNCTION is_chat_member(UUID) SET search_path = '';

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
