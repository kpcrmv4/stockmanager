/**
 * POST /api/chat/bot-message
 *
 * ส่งข้อความ Bot / Action Card เข้าห้องแชท
 * ใช้ service role (bypass RLS) สำหรับ server-side triggers
 *
 * Body:
 *   - store_id: string           — หาห้อง store chat ของสาขานี้
 *   - type: 'text' | 'action_card' | 'system'
 *   - content: string            — ข้อความ / system text
 *   - metadata?: object          — action card data
 *
 * Auth: Bearer CRON_SECRET (same as cron jobs)
 */

import { NextResponse } from 'next/server';
import { createServiceClient, createClient as createServerClient } from '@/lib/supabase/server';
import { getChatBotSettings, isBotTypeEnabled, getTimeoutForType, getPriorityForType } from '@/lib/chat/bot-settings';
import type { ChatMessage, ChatBroadcastPayload, UnreadBadgePayload } from '@/types/chat';
import { createClient as createRealtimeClient } from '@supabase/supabase-js';
import { broadcastToChannel, broadcastToMany } from '@/lib/supabase/broadcast';
import { sendPushToUser, type PushPayload } from '@/lib/notifications/push';

export async function POST(request: Request) {
  // Auth check: CRON_SECRET (server-to-server) OR user session (client components)
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  const isCronAuth = token === process.env.CRON_SECRET;

  if (!isCronAuth) {
    // Fallback: check user session
    const userClient = await createServerClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const { store_id, type, content, metadata } = body;

    if (!store_id) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. หาห้อง store chat ของสาขานี้
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('store_id', store_id)
      .eq('type', 'store')
      .eq('is_active', true)
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Chat room not found for this store' }, { status: 404 });
    }

    // 1.5 Check bot settings — skip if this action type is disabled
    if (type === 'action_card' && metadata?.action_type) {
      const botSettings = await getChatBotSettings(store_id);
      const actionType = metadata.action_type as string;

      if (!isBotTypeEnabled(botSettings, actionType)) {
        return NextResponse.json({ success: true, skipped: true, reason: 'bot_type_disabled' });
      }

      // Override timeout & priority from settings
      metadata.timeout_minutes = getTimeoutForType(botSettings, actionType);
      metadata.priority = getPriorityForType(botSettings, actionType);
    }

    // 2. Insert bot message (via SECURITY DEFINER function)
    const { data: messageId } = await supabase.rpc('insert_bot_message', {
      p_room_id: room.id,
      p_type: type || 'text',
      p_content: content,
      p_metadata: metadata || null,
    });

    if (!messageId) {
      return NextResponse.json({ error: 'Failed to insert message' }, { status: 500 });
    }

    // 3. Build full message for broadcast
    const message: ChatMessage = {
      id: messageId,
      room_id: room.id,
      sender_id: null,
      type: type || 'text',
      content,
      metadata: metadata || null,
      created_at: new Date().toISOString(),
      archived_at: null,
      sender: null,
    };

    // 4. Broadcast ไปห้อง
    const realtimeClient = createRealtimeClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await broadcastToChannel(realtimeClient, `chat:room:${room.id}`, 'new_message', {
      type: 'new_message',
      message,
    } as unknown as Record<string, unknown>);

    // 5. Broadcast badge ไปสมาชิกทุกคน
    const { data: members } = await supabase
      .from('chat_members')
      .select('user_id')
      .eq('room_id', room.id);

    if (members) {
      const badgePayload: UnreadBadgePayload = {
        room_id: room.id,
        sender_id: 'bot',
        sender_name: 'Bot',
        preview: content?.slice(0, 100) || 'Action Card ใหม่',
        type: type || 'text',
      };

      await broadcastToMany(
        realtimeClient,
        members.map((member) => ({
          channel: `chat:badge:${member.user_id}`,
          event: 'new_message_badge',
          payload: badgePayload as unknown as Record<string, unknown>,
        })),
      );
    }

    // 6. Push notification ไปสมาชิกทุกคน (สำหรับคนปิดแอป/ปิดหน้าจอ)
    if (members) {
      const { data: roomInfo } = await supabase
        .from('chat_rooms')
        .select('name')
        .eq('id', room.id)
        .single();

      const pushPayload: PushPayload = {
        title: roomInfo?.name || 'แชท',
        body: `Bot: ${content?.slice(0, 100) || 'มีรายการใหม่'}`,
        url: `/chat/${room.id}`,
        data: {
          type: 'chat_message',
          room_id: room.id,
          sender_id: 'bot',
          url: `/chat/${room.id}`,
        },
      };

      // Fire-and-forget — ไม่ต้องรอผล push
      Promise.allSettled(
        members.map((m) => sendPushToUser(m.user_id, pushPayload))
      ).catch((err) => console.error('[Bot Push] error:', err));
    }

    // 7. Update pinned summary ถ้าเป็น action_card
    if (type === 'action_card') {
      await updatePinnedSummary(supabase, room.id);
    }

    return NextResponse.json({ success: true, message_id: messageId });
  } catch (error) {
    console.error('[Bot Message] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * อัปเดต pinned_summary ของห้อง (รอรับ/กำลังทำ/เสร็จวันนี้)
 */
async function updatePinnedSummary(
  supabase: ReturnType<typeof createServiceClient>,
  roomId: string
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: cards } = await supabase
    .from('chat_messages')
    .select('metadata')
    .eq('room_id', roomId)
    .eq('type', 'action_card')
    .is('archived_at', null)
    .gte('created_at', today.toISOString());

  if (!cards) return;

  let pending = 0;
  let inProgress = 0;
  let completed = 0;

  for (const card of cards) {
    const meta = card.metadata as Record<string, unknown> | null;
    const status = meta?.status as string;
    if (status === 'pending' || status === 'pending_bar') pending++;
    else if (status === 'claimed') inProgress++;
    else if (status === 'completed') completed++;
  }

  await supabase
    .from('chat_rooms')
    .update({
      pinned_summary: {
        pending_count: pending,
        in_progress_count: inProgress,
        completed_today: completed,
        updated_at: new Date().toISOString(),
      },
    })
    .eq('id', roomId);
}
