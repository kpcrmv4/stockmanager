-- ==========================================
-- Migration: Fix pinned messages RLS to allow owner/manager profiles
-- ==========================================
-- Previously only chat_members.role = 'admin' could pin/unpin.
-- But owner/manager users are added to store rooms as 'member',
-- so pin/unpin silently failed for them.
-- Fix: also allow if profiles.role IN ('owner', 'manager').

-- Drop old policies
DROP POLICY IF EXISTS "Admins can pin messages" ON chat_pinned_messages;
DROP POLICY IF EXISTS "Admins can unpin messages" ON chat_pinned_messages;

-- Recreate with profiles.role check
CREATE POLICY "Admins can pin messages"
  ON chat_pinned_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_pinned_messages.room_id
        AND chat_members.user_id = auth.uid()
        AND (
          chat_members.role = 'admin'
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('owner', 'manager')
          )
        )
    )
  );

CREATE POLICY "Admins can unpin messages"
  ON chat_pinned_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_pinned_messages.room_id
        AND chat_members.user_id = auth.uid()
        AND (
          chat_members.role = 'admin'
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('owner', 'manager')
          )
        )
    )
  );
