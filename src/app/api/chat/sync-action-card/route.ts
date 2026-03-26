/**
 * POST /api/chat/sync-action-card
 *
 * Sync action card status in chat when deposits/withdrawals are processed
 * outside of chat (e.g. on the deposit page or withdrawals page).
 *
 * Body:
 *   - store_id: string
 *   - reference_id: string        — deposit_code (used as action card reference_id)
 *   - action_type: string         — 'withdrawal_claim' | 'deposit_claim' | etc.
 *   - new_status: string          — 'completed' | 'rejected' | 'cancelled' | etc.
 *   - completed_by?: string       — user id who completed the action
 *   - completed_by_name?: string  — display name
 */

import { NextResponse } from 'next/server';
import { createServiceClient, createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createRealtimeClient } from '@supabase/supabase-js';
import { broadcastToChannel } from '@/lib/supabase/broadcast';
import type { ChatMessage } from '@/types/chat';

export async function POST(request: Request) {
  // Auth: user session only
  const userClient = await createServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { store_id, reference_id, action_type, new_status, completed_by, completed_by_name } = body as {
      store_id: string;
      reference_id: string;
      action_type: string;
      new_status: string;
      completed_by?: string;
      completed_by_name?: string;
    };

    if (!store_id || !reference_id || !action_type || !new_status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. Find the store's chat room
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('store_id', store_id)
      .eq('type', 'store')
      .eq('is_active', true)
      .single();

    if (!room) {
      return NextResponse.json({ success: true, skipped: true, reason: 'no_chat_room' });
    }

    // 2. Find the latest matching action card message
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('id, metadata')
      .eq('room_id', room.id)
      .eq('type', 'action_card')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'no_messages' });
    }

    // Find the matching action card by reference_id and action_type
    const targetMessage = messages.find((msg) => {
      const meta = msg.metadata as Record<string, unknown> | null;
      if (!meta) return false;
      return (
        meta.reference_id === reference_id &&
        meta.action_type === action_type &&
        meta.status !== 'completed' &&
        meta.status !== 'rejected' &&
        meta.status !== 'cancelled'
      );
    });

    if (!targetMessage) {
      return NextResponse.json({ success: true, skipped: true, reason: 'no_matching_card' });
    }

    // 3. Update the action card metadata
    const oldMeta = targetMessage.metadata as Record<string, unknown>;
    const updatedMeta = {
      ...oldMeta,
      status: new_status,
      ...(new_status === 'completed' && {
        completed_at: new Date().toISOString(),
        claimed_by: completed_by || oldMeta.claimed_by,
        claimed_by_name: completed_by_name || oldMeta.claimed_by_name,
      }),
    };

    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({ metadata: updatedMeta })
      .eq('id', targetMessage.id);

    if (updateError) {
      console.error('[Sync Action Card] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update action card' }, { status: 500 });
    }

    // 4. Broadcast the updated message to the chat room so UI updates in real-time
    const { data: fullMessage } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('id', targetMessage.id)
      .single();

    if (fullMessage) {
      const realtimeClient = createRealtimeClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      await broadcastToChannel(realtimeClient, `chat:room:${room.id}`, 'message_updated', {
        type: 'message_updated',
        message: fullMessage as unknown as ChatMessage,
      } as unknown as Record<string, unknown>);
    }

    return NextResponse.json({ success: true, message_id: targetMessage.id });
  } catch (error) {
    console.error('[Sync Action Card] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
