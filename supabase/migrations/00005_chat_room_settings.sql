-- ==========================================
-- Migration: Chat Room Settings & Pinned Messages & Mute
-- ==========================================

-- 1. Add avatar_url and created_by to chat_rooms
ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) DEFAULT NULL;

-- 2. Pinned messages table
CREATE TABLE IF NOT EXISTS chat_pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES profiles(id),
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_pinned_room ON chat_pinned_messages(room_id, pinned_at DESC);

-- RLS for pinned messages
ALTER TABLE chat_pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pinned messages"
  ON chat_pinned_messages FOR SELECT
  USING (is_chat_member(room_id));

CREATE POLICY "Admins can pin messages"
  ON chat_pinned_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_pinned_messages.room_id
        AND chat_members.user_id = auth.uid()
        AND chat_members.role = 'admin'
    )
  );

CREATE POLICY "Admins can unpin messages"
  ON chat_pinned_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_pinned_messages.room_id
        AND chat_members.user_id = auth.uid()
        AND chat_members.role = 'admin'
    )
  );

-- 3. Add muted column to chat_members
ALTER TABLE chat_members
  ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;

-- 4. Update chat_rooms policies to allow admins to update name/avatar
-- Drop existing update policy if any and recreate
DO $$
BEGIN
  DROP POLICY IF EXISTS "Managers can update rooms" ON chat_rooms;
  DROP POLICY IF EXISTS "Admins can update rooms" ON chat_rooms;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Admins can update rooms"
  ON chat_rooms FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_rooms.id
        AND chat_members.user_id = auth.uid()
        AND chat_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_members
      WHERE chat_members.room_id = chat_rooms.id
        AND chat_members.user_id = auth.uid()
        AND chat_members.role = 'admin'
    )
  );

-- 5. Allow insert for authenticated users (create rooms)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Managers can create rooms" ON chat_rooms;
  DROP POLICY IF EXISTS "Authenticated users can create rooms" ON chat_rooms;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Authenticated users can create rooms"
  ON chat_rooms FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Allow admins to manage members (insert/delete)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can add members" ON chat_members;
  DROP POLICY IF EXISTS "Admins can remove members" ON chat_members;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Admins can add members"
  ON chat_members FOR INSERT
  WITH CHECK (
    -- Allow if user is admin of the room OR if creating initial members (room creator)
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = chat_members.room_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
    OR
    -- Or allow self-insert (for room creation flow)
    chat_members.user_id = auth.uid()
  );

CREATE POLICY "Admins can remove members"
  ON chat_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = chat_members.room_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

-- 7. Allow members to update their own muted status
DO $$
BEGIN
  DROP POLICY IF EXISTS "Members can update own membership" ON chat_members;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Members can update own membership"
  ON chat_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
