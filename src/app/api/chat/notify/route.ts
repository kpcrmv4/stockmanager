/**
 * POST /api/chat/notify
 *
 * Send push notifications to chat room members when a new message arrives.
 * Called fire-and-forget from the client after sending a chat message.
 *
 * Body:
 * {
 *   room_id: string,
 *   sender_id: string,
 *   sender_name: string,
 *   preview: string,       // first 100 chars of message
 *   message_type: 'text' | 'image' | 'action_card'
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendPushToUser, type PushPayload } from '@/lib/notifications/push';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate caller
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse body
    const { room_id, sender_id, sender_name, preview, message_type, mention_user_ids } =
      (await request.json()) as {
        room_id: string;
        sender_id: string;
        sender_name: string;
        preview: string;
        message_type: string;
        mention_user_ids?: string[];
      };

    const mentionIds = new Set(mention_user_ids || []);
    const hasAtAll = (preview || '').includes('@all') || (preview || '').includes('@ทุกคน');

    if (!room_id || !sender_id) {
      return NextResponse.json(
        { error: 'Missing room_id or sender_id' },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // 3. Get room info for notification title
    const { data: room } = await serviceClient
      .from('chat_rooms')
      .select('name')
      .eq('id', room_id)
      .single();

    const roomName = room?.name || 'แชท';

    // 4. Get all members except sender (+ check muted status)
    const { data: members } = await serviceClient
      .from('chat_members')
      .select('user_id, muted')
      .eq('room_id', room_id)
      .neq('user_id', sender_id);

    if (!members || members.length === 0) {
      return NextResponse.json({ status: 'ok', sent: 0 });
    }

    // Filter out muted members — ยกเว้น @mention/@all จะส่งทุกคน
    const activeMembers = members.filter(
      (m) => !m.muted || hasAtAll || mentionIds.has(m.user_id),
    );

    // 5. Build push payload
    const body =
      message_type === 'image'
        ? `${sender_name}: ส่งรูปภาพ`
        : `${sender_name}: ${preview || 'ข้อความใหม่'}`;

    const payload: PushPayload = {
      title: roomName,
      body,
      url: `/chat/${room_id}`,
      data: {
        type: 'chat_message',
        room_id,
        sender_id,
        url: `/chat/${room_id}`,
      },
    };

    // 6. Send push to each active (non-muted) member
    let sent = 0;
    console.log(`[ChatNotify] Sending push to ${activeMembers.length} members for room ${room_id}`);

    const results = await Promise.allSettled(
      activeMembers.map(async (m) => {
        const count = await sendPushToUser(m.user_id, payload);
        if (count > 0) sent += count;
        return { user_id: m.user_id, count };
      }),
    );

    // Log results
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(
        `[ChatNotify] ${failures.length} push(es) failed for room ${room_id}`,
      );
    }
    console.log(`[ChatNotify] Push sent: ${sent}/${activeMembers.length} for room ${room_id}`);

    return NextResponse.json({ status: 'ok', sent, total_members: activeMembers.length });
  } catch (error) {
    console.error('[ChatNotify] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
