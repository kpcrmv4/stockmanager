import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';
import { createClient as createRealtimeClient } from '@supabase/supabase-js';
import { broadcastToChannel } from '@/lib/supabase/broadcast';
import { sendBotMessage } from '@/lib/chat/bot';
import type { ChatMessage } from '@/types/chat';

/**
 * POST /api/customer/cancel-deposit-request
 *
 * Customer cancels a deposit request they just submitted via LIFF, before
 * staff has received it. Only `status='pending_staff'` rows are cancellable
 * here — once staff has started filling product details (pending_confirm),
 * they have to walk it back manually.
 *
 * Body: { depositId: string, token?: string, accessToken?: string }
 *
 * Side-effects:
 *  1. deposits row → status='cancelled', notes appended with cancel reason
 *  2. chat action card (deposit_claim) → status='cancelled', broadcast update
 *  3. system bot message in branch chat: "ลูกค้ายกเลิกการฝาก #DEP-..."
 *  4. audit log
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { depositId, token, accessToken } = body as {
    depositId?: string;
    token?: string;
    accessToken?: string;
  };

  if (!depositId) {
    return NextResponse.json({ error: 'Missing depositId' }, { status: 400 });
  }

  // ---------- Auth: token (HMAC) or LIFF accessToken ----------
  let lineUserId: string | null = null;
  if (token) {
    lineUserId = verifyCustomerToken(token);
  } else if (accessToken) {
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { userId: string };
      lineUserId = profile.userId;
    }
  }
  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // ---------- Load + verify ownership + cancellable state ----------
  const { data: deposit, error: loadError } = await supabase
    .from('deposits')
    .select('id, deposit_code, store_id, line_user_id, customer_name, status, notes')
    .eq('id', depositId)
    .maybeSingle();

  if (loadError || !deposit) {
    return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
  }
  if (deposit.line_user_id !== lineUserId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (deposit.status !== 'pending_staff') {
    // Staff has already started receiving — customer can't self-cancel.
    return NextResponse.json(
      { error: 'ไม่สามารถยกเลิกได้ เนื่องจากพนักงานเริ่มรับเข้าระบบแล้ว' },
      { status: 409 },
    );
  }

  // ---------- 1. Update deposit row ----------
  const cancelNote = 'ลูกค้ายกเลิกผ่าน LIFF';
  const newNotes = deposit.notes
    ? `${deposit.notes} | ${cancelNote}`
    : cancelNote;

  const { error: updateError } = await supabase
    .from('deposits')
    .update({ status: 'cancelled', notes: newNotes })
    .eq('id', depositId);

  if (updateError) {
    console.error('[CancelDepositRequest] update error:', updateError);
    return NextResponse.json(
      { error: 'ไม่สามารถยกเลิกได้ กรุณาลองใหม่' },
      { status: 500 },
    );
  }

  // ---------- 2. Sync chat action card ----------
  // Inline the same logic /api/chat/sync-action-card runs (we can't call
  // that endpoint here because it requires a Supabase user session).
  try {
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('store_id', deposit.store_id)
      .eq('type', 'store')
      .eq('is_active', true)
      .single();

    if (room) {
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('id, metadata')
        .eq('room_id', room.id)
        .eq('type', 'action_card')
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      const target = (messages || []).find((m) => {
        const meta = m.metadata as Record<string, unknown> | null;
        if (!meta) return false;
        return (
          meta.reference_id === deposit.deposit_code &&
          meta.action_type === 'deposit_claim' &&
          meta.status !== 'completed' &&
          meta.status !== 'rejected' &&
          meta.status !== 'cancelled'
        );
      });

      if (target) {
        const oldMeta = target.metadata as Record<string, unknown>;
        const updatedMeta = {
          ...oldMeta,
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        };
        await supabase
          .from('chat_messages')
          .update({ metadata: updatedMeta })
          .eq('id', target.id);

        // Broadcast so other connected clients see the card flip in real-time.
        const { data: full } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('id', target.id)
          .single();
        if (full) {
          const rt = createRealtimeClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          await broadcastToChannel(rt, `chat:room:${room.id}`, 'message_updated', {
            type: 'message_updated',
            message: full as unknown as ChatMessage,
          } as unknown as Record<string, unknown>);
        }
      }
    }
  } catch (err) {
    console.error('[CancelDepositRequest] sync card failed:', err);
  }

  // ---------- 3. System bot message in branch chat ----------
  try {
    await sendBotMessage({
      storeId: deposit.store_id,
      type: 'system',
      content: `❌ ลูกค้ายกเลิกการฝาก ${deposit.deposit_code} (${deposit.customer_name || 'ลูกค้า'})`,
      metadata: {
        kind: 'customer_cancelled_deposit_request',
        deposit_code: deposit.deposit_code,
        customer_name: deposit.customer_name || null,
      },
    });
  } catch (err) {
    console.error('[CancelDepositRequest] bot message failed:', err);
  }

  // ---------- 4. Audit ----------
  await supabase.from('audit_logs').insert({
    store_id: deposit.store_id,
    action_type: 'CUSTOMER_DEPOSIT_REQUEST_CANCELLED',
    table_name: 'deposits',
    record_id: deposit.id,
    new_value: {
      deposit_code: deposit.deposit_code,
      customer_name: deposit.customer_name,
      line_user_id: lineUserId,
    },
    changed_by: null,
  });

  return NextResponse.json({ success: true, depositCode: deposit.deposit_code });
}
