'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import type { ChatRoom, ChatMessage } from '@/types/chat';

const PAGE_SIZE = 1;  // 1 last message per room

/**
 * โหลดห้องแชททั้งหมดที่ user เป็นสมาชิก
 * + last message + unread counts
 */
export function useChatRooms() {
  const { user } = useAuthStore();
  const { rooms, setRooms, setUnreadCounts } = useChatStore();

  const fetchRooms = useCallback(async () => {
    if (!user) return;

    const supabase = createClient();

    // 1. ดึงห้องที่เป็นสมาชิก พร้อม members
    const { data: memberRows } = await supabase
      .from('chat_members')
      .select(`
        room_id,
        last_read_at,
        chat_rooms!inner (
          id, store_id, name, type, is_active, pinned_summary, avatar_url, created_by, created_at, updated_at
        )
      `)
      .eq('user_id', user.id)
      .eq('chat_rooms.is_active', true);

    if (!memberRows || memberRows.length === 0) {
      setRooms([]);
      return;
    }

    const roomIds = memberRows.map((m) => m.room_id);

    // 2. ดึงข้อความล่าสุดของแต่ละห้อง (1 ข้อความ)
    const { data: lastMessages } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, type, content, metadata, created_at, profiles:sender_id(id, username, display_name, avatar_url, role)')
      .in('room_id', roomIds)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE * roomIds.length);

    // Group last message per room
    type MsgRow = Record<string, unknown>;
    const lastMsgMap = new Map<string, MsgRow>();
    if (lastMessages) {
      for (const msg of lastMessages as unknown as MsgRow[]) {
        const rid = msg.room_id as string;
        if (!lastMsgMap.has(rid)) {
          lastMsgMap.set(rid, msg);
        }
      }
    }

    // 3. Unread counts
    const { data: unreadData } = await supabase.rpc('get_chat_unread_counts', {
      p_user_id: user.id,
    });

    const unreadMap: Record<string, number> = {};
    if (unreadData) {
      for (const row of unreadData) {
        unreadMap[row.room_id] = Number(row.unread_count);
      }
    }

    // 4. Build rooms
    const chatRooms: ChatRoom[] = memberRows.map((m) => {
      const room = m.chat_rooms as unknown as ChatRoom;
      const lastMsg = lastMsgMap.get(m.room_id);
      return {
        ...room,
        unread_count: unreadMap[m.room_id] || 0,
        last_message: lastMsg
          ? ({
              id: lastMsg.id,
              room_id: lastMsg.room_id,
              sender_id: lastMsg.sender_id,
              type: lastMsg.type,
              content: lastMsg.content,
              metadata: lastMsg.metadata,
              created_at: lastMsg.created_at,
              archived_at: null,
              sender: lastMsg.profiles,
            } as unknown as ChatMessage)
          : null,
      };
    });

    // Sort: unread first, then by last message time
    chatRooms.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.created_at;
      const bTime = b.last_message?.created_at || b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setRooms(chatRooms);
    setUnreadCounts(unreadMap);
  }, [user, setRooms, setUnreadCounts]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return { rooms, refetch: fetchRooms };
}
