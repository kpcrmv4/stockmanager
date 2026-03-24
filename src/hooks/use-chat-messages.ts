'use client';

import { useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import type { ChatMessage } from '@/types/chat';

const PAGE_SIZE = 30;

/**
 * โหลดข้อความของห้องแชท + pagination + mark as read
 */
export function useChatMessages(roomId: string | null) {
  const { user } = useAuthStore();
  const {
    messages,
    hasMore,
    isLoadingMessages,
    setMessages,
    prependMessages,
    setHasMore,
    setIsLoadingMessages,
    clearUnread,
  } = useChatStore();

  const oldestRef = useRef<string | null>(null);

  // โหลดข้อความล่าสุด (initial load)
  const fetchMessages = useCallback(async () => {
    if (!roomId || !user) return;

    setIsLoadingMessages(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('chat_messages')
      .select(
        'id, room_id, sender_id, type, content, metadata, created_at, archived_at, profiles:sender_id(id, username, display_name, avatar_url, role)'
      )
      .eq('room_id', roomId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (data) {
      const msgs: ChatMessage[] = data.reverse().map(mapMessage);
      setMessages(msgs);
      setHasMore(data.length === PAGE_SIZE);
      oldestRef.current = msgs.length > 0 ? msgs[0].created_at : null;
    }

    setIsLoadingMessages(false);

    // Mark as read
    markAsRead(roomId, user.id);
    clearUnread(roomId);
  }, [roomId, user, setMessages, setHasMore, setIsLoadingMessages, clearUnread]);

  // โหลดข้อความเก่ากว่า (scroll up)
  const loadMore = useCallback(async () => {
    if (!roomId || !hasMore || isLoadingMessages || !oldestRef.current) return;

    setIsLoadingMessages(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('chat_messages')
      .select(
        'id, room_id, sender_id, type, content, metadata, created_at, archived_at, profiles:sender_id(id, username, display_name, avatar_url, role)'
      )
      .eq('room_id', roomId)
      .is('archived_at', null)
      .lt('created_at', oldestRef.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (data) {
      const msgs: ChatMessage[] = data.reverse().map(mapMessage);
      prependMessages(msgs);
      setHasMore(data.length === PAGE_SIZE);
      if (msgs.length > 0) {
        oldestRef.current = msgs[0].created_at;
      }
    }

    setIsLoadingMessages(false);
  }, [roomId, hasMore, isLoadingMessages, prependMessages, setHasMore, setIsLoadingMessages]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return { messages, hasMore, isLoadingMessages, loadMore, refetch: fetchMessages };
}

// ==========================================
// Helpers
// ==========================================

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    room_id: row.room_id as string,
    sender_id: row.sender_id as string | null,
    type: row.type as ChatMessage['type'],
    content: row.content as string | null,
    metadata: row.metadata as ChatMessage['metadata'],
    created_at: row.created_at as string,
    archived_at: row.archived_at as string | null,
    sender: row.profiles as ChatMessage['sender'],
  };
}

async function markAsRead(roomId: string, userId: string) {
  const supabase = createClient();
  await supabase
    .from('chat_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', userId);
}
