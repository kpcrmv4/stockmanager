'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { broadcastToChannel, broadcastToMany } from '@/lib/supabase/broadcast';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { useChatSound } from './use-chat-sound';
import type { ChatMessage, ChatBroadcastPayload, UnreadBadgePayload, ChatPinnedMessage } from '@/types/chat';

/**
 * Realtime สำหรับห้องที่กำลังดู — ใช้ Broadcast (ไม่ใช่ postgres_changes)
 * ประหยัด Realtime quota ~80%
 */
export function useChatRealtime(roomId: string | null) {
  const { user } = useAuthStore();
  const { addMessage, updateMessage, clearUnread, isMuted, addPinnedMessage, removePinnedMessage } = useChatStore();
  const { playMessageSound, playMentionSound, playTaskSound } = useChatSound();
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

          // Play sound — different for action cards vs chat vs @mention
          const isMentioned = checkMention(data.message, user.id);
          const isActionCard = data.message.type === 'action_card';
          if (isActionCard) {
            // Action card / task: distinct sound + vibrate (always, ignore mute)
            playTaskSound();
          } else if (isMentioned) {
            playMentionSound();
          } else if (!isMuted) {
            playMessageSound();
          }
        }
      })
      .on('broadcast', { event: 'message_updated' }, (payload) => {
        const data = payload.payload as ChatBroadcastPayload;
        if (data.message) {
          updateMessage(data.message);
        }
      })
      .on('broadcast', { event: 'message_pinned' }, (payload) => {
        const data = payload.payload as ChatBroadcastPayload;
        if (data.pinned_message) {
          addPinnedMessage(data.pinned_message);
        }
      })
      .on('broadcast', { event: 'message_unpinned' }, (payload) => {
        const data = payload.payload as ChatBroadcastPayload;
        if (data.message_id) {
          removePinnedMessage(data.message_id);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        // Presence sync — สามารถใช้สำหรับ typing indicator
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, user, addMessage, updateMessage, clearUnread, isMuted, playMessageSound, playMentionSound, playTaskSound, addPinnedMessage, removePinnedMessage]);

  return channelRef;
}

/**
 * Global badge channel — subscribe ทุกห้องที่เป็นสมาชิก
 * ใช้ single channel เพื่อรับ unread badge จากทุกห้อง
 * + เล่นเสียงแจ้งเตือน (ถ้าไม่ได้ mute)
 */
export function useChatBadge() {
  const { user } = useAuthStore();
  const { activeRoomId, incrementUnread } = useChatStore();
  const { playMessageSound, playMentionSound, playTaskSound } = useChatSound();

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

          // Action card / task: always play task sound + vibrate (even non-active room)
          if (data.type === 'action_card') {
            playTaskSound();
            return;
          }

          // Check if @mention or @all in preview
          const preview = data.preview || '';
          const isMentioned =
            preview.includes(`@${user.displayName}`) ||
            preview.includes(`@${user.username}`) ||
            preview.includes('@all') ||
            preview.includes('@ทุกคน');

          if (isMentioned) {
            playMentionSound();
          }
          // Note: normal badge sound not played for non-active rooms to avoid spam
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeRoomId, incrementUnread, playMessageSound, playMentionSound, playTaskSound]);
}

// ==========================================
// Send message helper
// ==========================================

export async function sendChatMessage(
  roomId: string,
  senderId: string,
  content: string,
  senderInfo: { username: string; display_name: string | null; avatar_url: string | null; role: string },
  metadata?: Record<string, unknown> | null
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
      metadata: metadata || null,
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

  // 2. Fire-and-forget: Broadcast + Badge + Push (ไม่ block การ return message)
  broadcastAndNotify(supabase, roomId, senderId, senderInfo, message, content, metadata)
    .catch((err) => console.error('[Chat] broadcast/notify failed:', err));

  return message;
}

/**
 * ส่งรูปภาพในแชท — upload แล้วส่ง image message
 */
export async function sendChatImageMessage(
  roomId: string,
  senderId: string,
  file: File,
  senderInfo: { username: string; display_name: string | null; avatar_url: string | null; role: string }
): Promise<ChatMessage | null> {
  const supabase = createClient();

  // 1. Upload image via API
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'chat');

  const uploadRes = await fetch('/api/upload/photo', {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) return null;

  const { url: imageUrl } = await uploadRes.json();
  if (!imageUrl) return null;

  // 2. INSERT image message
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      room_id: roomId,
      sender_id: senderId,
      type: 'image',
      content: imageUrl,
    })
    .select('id, room_id, sender_id, type, content, metadata, created_at, archived_at')
    .single();

  if (error || !data) return null;

  const message: ChatMessage = {
    ...data,
    sender: { id: senderId, ...senderInfo },
  };

  // 3. Fire-and-forget: Broadcast + Badge + Push (ไม่ block การ return message)
  broadcastAndNotify(supabase, roomId, senderId, senderInfo, message, 'ส่งรูปภาพ', null)
    .catch((err) => console.error('[Chat] image broadcast/notify failed:', err));

  return message;
}

// ==========================================
// Helpers
// ==========================================

/**
 * Background broadcast + badge + push notification
 * แยกออกมาเพื่อไม่ block การ return message กลับ UI
 */
async function broadcastAndNotify(
  supabase: ReturnType<typeof createClient>,
  roomId: string,
  senderId: string,
  senderInfo: { username: string; display_name: string | null; avatar_url: string | null; role: string },
  message: ChatMessage,
  preview: string,
  metadata?: Record<string, unknown> | null,
) {
  // Broadcast ไปห้อง (สำหรับคนอื่นที่กำลังดู)
  await broadcastToChannel(supabase, `chat:room:${roomId}`, 'new_message', {
    type: 'new_message',
    message,
  } as unknown as Record<string, unknown>);

  // Broadcast badge ไปทุกคนในห้อง
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
      preview: preview.slice(0, 100),
      type: message.type as 'text' | 'image',
    };

    await broadcastToMany(
      supabase,
      members.map((member) => ({
        channel: `chat:badge:${member.user_id}`,
        event: 'new_message_badge',
        payload: badgePayload as unknown as Record<string, unknown>,
      })),
    );
  }

  // Push notification สำหรับคนที่ปิดหน้าจอ
  const mentionIds = extractMentionIds(metadata);
  notifyChatPush(roomId, senderId, senderInfo.display_name || senderInfo.username, preview.slice(0, 100), message.type, mentionIds);
}

/** ตรวจสอบว่า message มี @mention ถึง user หรือ @all */
function checkMention(message: ChatMessage, userId: string): boolean {
  // Check metadata mentions
  const meta = message.metadata as Record<string, unknown> | null;
  if (meta?.mentions) {
    const mentions = meta.mentions as Array<{ user_id: string }>;
    if (mentions.some((m) => m.user_id === userId)) return true;
  }

  // Check content for @all
  const content = message.content || '';
  if (content.includes('@all') || content.includes('@ทุกคน')) return true;

  return false;
}

/**
 * Fire-and-forget: ส่ง push notification ไป API สำหรับคนที่ไม่ได้เปิดแอป
 */
function notifyChatPush(
  roomId: string,
  senderId: string,
  senderName: string,
  preview: string,
  messageType: string,
  mentionUserIds?: string[],
) {
  fetch('/api/chat/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: roomId,
      sender_id: senderId,
      sender_name: senderName,
      preview,
      message_type: messageType,
      mention_user_ids: mentionUserIds || [],
    }),
  }).catch((err) => console.error('[ChatPush] notify failed:', err));
}

/** ดึง user_id จาก mentions metadata + detect @all */
function extractMentionIds(metadata?: Record<string, unknown> | null): string[] {
  if (!metadata) return [];

  const ids: string[] = [];

  // Explicit @mentions
  if (Array.isArray(metadata.mentions)) {
    for (const m of metadata.mentions) {
      if (m && typeof m === 'object' && 'user_id' in m) {
        ids.push((m as { user_id: string }).user_id);
      }
    }
  }

  return ids;
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
