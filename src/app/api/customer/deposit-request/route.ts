import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';
import { pushToStaffGroup, createFlexMessage } from '@/lib/line/messaging';
import { approvalRequestTemplate } from '@/lib/line/flex-templates';
import { notifyStoreStaff } from '@/lib/notifications/service';
import { sendBotMessage } from '@/lib/chat/bot';
import type { ActionCardMetadata } from '@/types/chat';

/**
 * POST /api/customer/deposit-request
 * Customer submits a deposit request via LIFF or token.
 *
 * The row is created directly in `deposits` with status='pending_staff' so it
 * lives in the same table as fully-confirmed deposits — staff/bar/owner just
 * see the lifecycle: pending_staff → pending_confirm → in_store. This matches
 * the legacy GAS shape (single Deposits sheet) and the import-deposits flow.
 *
 * Body: { customerName, customerPhone?, tableNumber?, notes?,
 *         customerPhotoUrl?, storeId, token?, accessToken? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    customerName,
    customerPhone,
    tableNumber,
    notes,
    customerPhotoUrl,
    storeId,
    token,
    accessToken,
  } = body as {
    customerName?: string;
    customerPhone?: string;
    tableNumber?: string;
    notes?: string;
    customerPhotoUrl?: string;
    storeId: string;
    token?: string;
    accessToken?: string;
  };

  if (!storeId) {
    return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
  }

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

  // Resolve store + generate deposit code in the standard DEP-{store}-{rand} format.
  const { data: store } = await supabase
    .from('stores')
    .select('store_name, store_code, line_token, deposit_notify_group_id')
    .eq('id', storeId)
    .single();

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 5; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const depositCode = `DEP-${store.store_code || 'X'}-${randomPart}`;

  // Insert the placeholder row. quantity=0 keeps the auto-bottle trigger from
  // firing (it has WHEN quantity > 0). product_name='' since staff fills it
  // when receiving. expiry_date is null until approval.
  const { data: inserted, error: insertError } = await supabase
    .from('deposits')
    .insert({
      store_id: storeId,
      deposit_code: depositCode,
      line_user_id: lineUserId,
      customer_name: customerName || 'ลูกค้า',
      customer_phone: customerPhone || null,
      product_name: '',
      quantity: 0,
      remaining_qty: 0,
      remaining_percent: 100,
      table_number: tableNumber || null,
      customer_photo_url: customerPhotoUrl || null,
      notes: notes || 'ลูกค้าฝากผ่าน LINE OA',
      status: 'pending_staff',
    })
    .select('id, deposit_code')
    .single();

  if (insertError) {
    console.error('[DepositRequest] Insert error:', insertError);
    return NextResponse.json(
      { error: 'ไม่สามารถส่งคำขอฝากเหล้าได้' },
      { status: 500 },
    );
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    store_id: storeId,
    action_type: 'CUSTOMER_DEPOSIT_REQUEST',
    table_name: 'deposits',
    record_id: inserted.id,
    new_value: {
      deposit_code: inserted.deposit_code,
      customer_name: customerName || 'ลูกค้า',
      line_user_id: lineUserId,
      table_number: tableNumber || null,
    },
    changed_by: null,
  });

  // LINE group notification (if configured)
  if (store.deposit_notify_group_id) {
    try {
      const flexMsg = createFlexMessage(
        'คำขอฝากเหล้าใหม่',
        approvalRequestTemplate(
          customerName || 'ลูกค้า',
          'ฝากเหล้า (รอ Staff ระบุรายละเอียด)',
          'deposit',
          store.store_name || '',
        ),
      );
      if (store.line_token) {
        await pushToStaffGroup(
          store.deposit_notify_group_id,
          [flexMsg],
          store.line_token,
        );
      }
    } catch (err) {
      console.error('[DepositRequest] Failed to notify staff via LINE:', err);
    }
  }

  // Web push + in-app notification
  try {
    await notifyStoreStaff({
      storeId,
      type: 'new_deposit',
      title: 'มีคำขอฝากเหล้าใหม่',
      body: `${customerName || 'ลูกค้า'}${tableNumber ? ` (โต๊ะ ${tableNumber})` : ''} ต้องการฝากเหล้า`,
      data: { deposit_code: inserted.deposit_code },
    });
  } catch (err) {
    console.error('[DepositRequest] Failed to send push notification:', err);
  }

  // Post the action card to the branch chat — same card travels through the
  // 3-stage lifecycle (pending → claimed → pending_bar → completed). Staff can
  // claim it in chat, fill product/qty + photo, then bar verifies.
  try {
    const meta: ActionCardMetadata = {
      action_type: 'deposit_claim',
      reference_id: inserted.deposit_code,
      reference_table: 'deposits',
      status: 'pending',
      claimed_by: null,
      claimed_by_name: null,
      claimed_at: null,
      completed_at: null,
      timeout_minutes: 15,
      priority: 'normal',
      summary: {
        customer: customerName || 'ลูกค้า',
        items: 'รอ Staff รับและระบุรายละเอียด',
        note: tableNumber ? `โต๊ะ ${tableNumber}` : notes || undefined,
        from_customer: true,
      },
    };
    await sendBotMessage({
      storeId,
      type: 'action_card',
      content: `รายการฝากใหม่จากลูกค้า ${customerName || 'ลูกค้า'} (${inserted.deposit_code})`,
      metadata: meta,
    });
  } catch (err) {
    console.error('[DepositRequest] Failed to post chat action card:', err);
  }

  return NextResponse.json({
    success: true,
    depositId: inserted.id,
    depositCode: inserted.deposit_code,
  });
}
