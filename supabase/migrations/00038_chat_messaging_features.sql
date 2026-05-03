-- ==========================================
-- Chat: Reactions + Albums + Search index
-- ==========================================
--
-- 1. chat_message_reactions  — emoji reactions on individual messages
-- 2. chat_albums             — shared photo albums per chat room
-- 3. chat_album_photos       — photos uploaded into an album
-- 4. pg_trgm GIN index on chat_messages.content for in-room search
--
-- All tables use is_chat_member() (defined in 00004) for RLS.
-- ==========================================

-- ==========================================
-- 1. REACTIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON chat_message_reactions(message_id);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_user
  ON chat_message_reactions(user_id);

ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- Members can view reactions on messages in their rooms.
DROP POLICY IF EXISTS "Members view reactions" ON chat_message_reactions;
CREATE POLICY "Members view reactions" ON chat_message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = chat_message_reactions.message_id
        AND is_chat_member(m.room_id)
    )
  );

-- Members can react with their own user_id on messages in their rooms.
DROP POLICY IF EXISTS "Members add own reactions" ON chat_message_reactions;
CREATE POLICY "Members add own reactions" ON chat_message_reactions
  FOR INSERT WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = chat_message_reactions.message_id
        AND is_chat_member(m.room_id)
    )
  );

-- Members can remove their own reactions.
DROP POLICY IF EXISTS "Members remove own reactions" ON chat_message_reactions;
CREATE POLICY "Members remove own reactions" ON chat_message_reactions
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ==========================================
-- 2. ALBUMS
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_albums_room
  ON chat_albums(room_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_albums_created_by
  ON chat_albums(created_by);

ALTER TABLE chat_albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view albums" ON chat_albums;
CREATE POLICY "Members view albums" ON chat_albums
  FOR SELECT USING (is_chat_member(room_id) OR is_admin());

DROP POLICY IF EXISTS "Members create albums" ON chat_albums;
CREATE POLICY "Members create albums" ON chat_albums
  FOR INSERT WITH CHECK (
    created_by = (SELECT auth.uid())
    AND is_chat_member(room_id)
  );

-- Album creator or chat admin can update / archive.
DROP POLICY IF EXISTS "Owners update albums" ON chat_albums;
CREATE POLICY "Owners update albums" ON chat_albums
  FOR UPDATE USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = chat_albums.room_id
        AND cm.user_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Owners delete albums" ON chat_albums;
CREATE POLICY "Owners delete albums" ON chat_albums
  FOR DELETE USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = chat_albums.room_id
        AND cm.user_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )
    OR is_admin()
  );

-- ==========================================
-- 3. ALBUM PHOTOS
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_album_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES chat_albums(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_album_photos_album
  ON chat_album_photos(album_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_album_photos_uploaded_by
  ON chat_album_photos(uploaded_by);

ALTER TABLE chat_album_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view album photos" ON chat_album_photos;
CREATE POLICY "Members view album photos" ON chat_album_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_albums a
      WHERE a.id = chat_album_photos.album_id
        AND (is_chat_member(a.room_id) OR is_admin())
    )
  );

-- Any chat member of the host room can upload to an album.
DROP POLICY IF EXISTS "Members upload album photos" ON chat_album_photos;
CREATE POLICY "Members upload album photos" ON chat_album_photos
  FOR INSERT WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM chat_albums a
      WHERE a.id = chat_album_photos.album_id
        AND is_chat_member(a.room_id)
    )
  );

-- Uploader, album owner, or chat admin can delete.
DROP POLICY IF EXISTS "Members delete own album photos" ON chat_album_photos;
CREATE POLICY "Members delete own album photos" ON chat_album_photos
  FOR DELETE USING (
    uploaded_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM chat_albums a
      WHERE a.id = chat_album_photos.album_id
        AND a.created_by = (SELECT auth.uid())
    )
    OR is_admin()
  );

-- ==========================================
-- 4. SEARCH INDEX
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_chat_messages_content_trgm
  ON chat_messages USING gin (content gin_trgm_ops)
  WHERE archived_at IS NULL AND type IN ('text', 'system');

-- ==========================================
-- NOTE on album-upload notifications:
--
-- When someone uploads photos into a shared album we post a regular
-- chat_messages row with type='system' and metadata = {
--   "kind": "album_upload" | "album_created",
--   "album_id": "...",
--   "album_name": "...",
--   "cover_url": "...",
--   "uploaded_by_name": "...",
--   "photo_count": N
-- }
-- This avoids enum migrations and reuses the existing message rendering
-- pipeline; the bubble component branches on metadata.kind.
-- ==========================================
