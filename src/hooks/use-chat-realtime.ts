'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import type { ChatMessage, ChatBroadcastPayload, UnreadBadgePayload } from '@/types/chat';

/**
 * Realtime สำหรับห้องที่กำลังดู — ใช้ Broadcast (ไม่ใช่ postgres_changes)
 * ประหยัด Realtime quota ~80%
 */
export function useChatRealtime(roomId: string | null) {
  const { user } = useAuthStore();
  const { addMessage, updateMessage, clearUnread } = useChatStore();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  useEffect(() => {
    if (!roomId || !user) return;

    const supabase = createClient();

    // Subscribe to room broadcast channel
    const channel = supabase
      .channel(`chat:room:${roomId}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const data = payload.payload as ChatBroadcastPayload;
        if (data.message && data.message.sender_id !== user.id) {
          addMessage(data.message);
          // Mark as read ทันทีเพราะกำลังดูอยู่
          markAsReadQuiet(roomId, user.id);
          clearUnread(roomId);
        }
      })
      .on('broadcast', { event: 'message_updated' }, (payload) => {
        const data = payload.payload as ChatBroadcastPayload;
        if (data.message) {
          updateMessage(data.message);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        // Presence sync — สามารถใช้สำหรับ typing indicator
        // const state = channel.presenceState();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, user, addMessage, updateMessage, clearUnread]);

  return channelRef;
}

/**
 * Global badge channel — subscribe ทุกห้องที่เป็นสมาชิก
 * ใช้ single channel เพื่อรับ unread badge จากทุกห้อง
 */
export function useChatBadge() {
  const { user } = useAuthStore();
  const { activeRoomId, incrementUnread } = useChatStore();

  useEffect(() => {
    if (!user) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`chat:badge:${user.id}`)
      .on('broadcast', { event: 'new_message_badge' }, (payload) => {
        const data = payload.payload as UnreadBadgePayload;
        // ไม่ increment ถ้ากำลังดูห้องนั้นอยู่
        if (data.room_id !== activeRoomId && data.sender_id !== user.id) {
          incrementUnread(data.room_id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeRoomId, incrementUnread]);
}

// ==========================================
// Send message helper
// ==========================================

export async function sendChatMessage(
  roomId: string,
  senderId: string,
  content: string,
  senderInfo: { username: string; display_name: string | null; avatar_url: string | null; role: string }
): Promise<ChatMessage | null> {
  const supabase = createClient();

  // 1. INSERT เข้า DB
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      room_id: roomId,
      sender_id: senderId,
      type: 'text',
      content,
    })
    .select('id, room_id, sender_id, type, content, metadata, created_at, archived_at')
    .single();

  if (error || !data) return null;

  const message: ChatMessage = {
    ...data,
    sender: {
      id: senderId,
      ...senderInfo,
    },
  };

  // 2. Broadcast ไปห้อง (สำหรับคนอื่นที่กำลังดู)
  await supabase.channel(`chat:room:${roomId}`).send({
    type: 'broadcast',
    event: 'new_message',
    payload: { type: 'new_message', message } as ChatBroadcastPayload,
  });

  // 3. Broadcast badge ไปทุกคนในห้อง
  //    (ใช้ server-side API route จะดีกว่า แต่ client-side ก็ใช้ได้)
  const { data: members } = await supabase
    .from('chat_members')
    .select('user_id')
    .eq('room_id', roomId)
    .neq('user_id', senderId);

  if (members) {
    const badgePayload: UnreadBadgePayload = {
      room_id: roomId,
      sender_id: senderId,
      sender_name: senderInfo.display_name || senderInfo.username,
      preview: content.slice(0, 100),
      type: 'text',
    };

    for (const member of members) {
      // ส่ง badge ไปแต่ละ user channel
      supabase.channel(`chat:badge:${member.user_id}`).send({
        type: 'broadcast',
        event: 'new_message_badge',
        payload: badgePayload,
      });
    }
  }

  return message;
}

// Quiet mark as read (ไม่ throw error)
async function markAsReadQuiet(roomId: string, userId: string) {
  try {
    const supabase = createClient();
    await supabase
      .from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('user_id', userId);
  } catch {
    // ignore
  }
}
