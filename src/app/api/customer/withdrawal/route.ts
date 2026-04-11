import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerToken } from '@/lib/auth/customer-token';
import { createServiceClient } from '@/lib/supabase/server';
import { pushToStaffGroup, createFlexMessage } from '@/lib/line/messaging';
import { approvalRequestTemplate } from '@/lib/line/flex-templates';
import { notifyStoreStaff } from '@/lib/notifications/service';
import { sendBotMessage, buildWithdrawalActionCard } from '@/lib/chat/bot';
import { isWithdrawalBlocked } from '@/lib/utils/date';

/**
 * POST /api/customer/withdrawal
 * ลูกค้าขอเบิกเหล้า
 *
 * Body: { depositId, customerName, token?, accessToken? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { depositId, customerName, token, accessToken, withdrawalType } = body as {
    depositId: string;
    customerName: string;
    token?: string;
    accessToken?: string;
    withdrawalType?: 'in_store' | 'take_home';
  };

  if (!depositId) {
    return NextResponse.json({ error: 'Missing depositId' }, { status: 400 });
  }

  // -----------------------------------------------------------------------
  // Verify identity
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Fetch deposit and verify ownership
  // -----------------------------------------------------------------------
  const supabase = createServiceClient();

  const { data: deposit } = await supabase
    .from('deposits')
    .select('*, store:stores(store_name, line_token, deposit_notify_group_id)')
    .eq('id', depositId)
    .eq('line_user_id', lineUserId)
    .single();

  if (!deposit) {
    return NextResponse.json({ error: 'Deposit not found' }, { status: 404 });
  }

  if (deposit.status !== 'in_store') {
    return NextResponse.json(
      { error: 'ไม่สามารถเบิกได้ สถานะไม่ถูกต้อง' },
      { status: 400 },
    );
  }

  // -----------------------------------------------------------------------
  // Check withdrawal blocked days
  // -----------------------------------------------------------------------
  const wType = withdrawalType || 'in_store';

  if (wType !== 'take_home') {
    const { data: storeSetting } = await supabase
      .from('store_settings')
      .select('withdrawal_blocked_days')
      .eq('store_id', deposit.store_id)
      .single();

    const blockedDays = storeSetting?.withdrawal_blocked_days ?? ['Fri', 'Sat'];
    const check = isWithdrawalBlocked(blockedDays);

    if (check.blocked) {
      return NextResponse.json(
        { error: check.reason, blocked: true, calendarDay: check.calendarDay },
        { status: 400 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Create withdrawal request
  // -----------------------------------------------------------------------
  const { error: insertError } = await supabase.from('withdrawals').insert({
    deposit_id: deposit.id,
    store_id: deposit.store_id,
    line_user_id: lineUserId,
    customer_name: customerName || deposit.customer_name || 'ลูกค้า',
    product_name: deposit.product_name,
    requested_qty: deposit.remaining_qty,
    withdrawal_type: wType,
    status: 'pending',
  });

  if (insertError) {
    return NextResponse.json(
      { error: 'ไม่สามารถส่งคำขอเบิกได้' },
      { status: 500 },
    );
  }

  // -----------------------------------------------------------------------
  // Update deposit status
  // -----------------------------------------------------------------------
  await supabase
    .from('deposits')
    .update({ status: 'pending_withdrawal' })
    .eq('id', deposit.id);

  // -----------------------------------------------------------------------
  // Audit log
  // -----------------------------------------------------------------------
  await supabase.from('audit_logs').insert({
    store_id: deposit.store_id,
    action_type: 'CUSTOMER_WITHDRAWAL_REQUEST',
    table_name: 'withdrawals',
    new_value: {
      customer_name: customerName || deposit.customer_name,
      product_name: deposit.product_name,
      line_user_id: lineUserId,
    },
    changed_by: null,
  });

  // -----------------------------------------------------------------------
  // Notify staff via LINE
  // -----------------------------------------------------------------------
  const depositStore = deposit.store as {
    store_name: string;
    line_token: string | null;
    deposit_notify_group_id: string | null;
  } | null;

  const notifyGroupId = depositStore?.deposit_notify_group_id;
  const notifyToken = depositStore?.line_token || '';
  const storeName = depositStore?.store_name || '';

  if (notifyGroupId && notifyToken) {
    try {
      const flexMsg = createFlexMessage(
        'คำขอเบิกเหล้า',
        approvalRequestTemplate(
          customerName || deposit.customer_name,
          deposit.product_name,
          'withdrawal',
          storeName,
        ),
      );
      await pushToStaffGroup(notifyGroupId, [flexMsg], notifyToken);
    } catch (err) {
      console.error('[Withdrawal] Failed to notify staff:', err);
    }
  }

  // Send web push + in-app notifications to staff/bar
  try {
    await notifyStoreStaff({
      storeId: deposit.store_id,
      type: 'withdrawal_request',
      title: 'มีคำขอเบิกเหล้า',
      body: `${customerName || deposit.customer_name} ขอเบิก ${deposit.product_name}`,
      data: { depositId: deposit.id, productName: deposit.product_name },
    });
  } catch (err) {
    console.error('[Withdrawal] Failed to send push notification:', err);
  }

  // -----------------------------------------------------------------------
  // Send Action Card to store chat
  // -----------------------------------------------------------------------
  try {
    const actionCard = buildWithdrawalActionCard({
      id: depositId,
      deposit_code: deposit.deposit_code,
      customer_name: customerName || deposit.customer_name || 'ลูกค้า',
      product_name: deposit.product_name,
      requested_qty: deposit.remaining_qty,
    });

    await sendBotMessage({
      storeId: deposit.store_id,
      ...actionCard,
    });
  } catch (err) {
    console.error('[Withdrawal] Failed to send chat action card:', err);
  }

  return NextResponse.json({ success: true });
}
