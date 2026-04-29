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
 * Body: { depositId, customerName, bottleIds?, token?, accessToken? }
 *
 * `bottleIds` is optional — when supplied (multi-bottle deposits), one
 * pending withdrawal row is created per picked bottle so the bar can
 * tick each off individually. When omitted, falls back to "withdraw
 * everything that's left" for backward compat with single-bottle cards.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { depositId, customerName, bottleIds, token, accessToken, withdrawalType, tableNumber } = body as {
    depositId: string;
    customerName: string;
    bottleIds?: string[];
    token?: string;
    accessToken?: string;
    withdrawalType?: 'in_store' | 'take_home';
    tableNumber?: string;
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
  // Validate selected bottles when supplied — they must belong to this
  // deposit and not be consumed yet. Empty/missing → "withdraw all
  // remaining" (legacy behaviour).
  // -----------------------------------------------------------------------
  let validBottleIds: string[] = [];
  if (Array.isArray(bottleIds) && bottleIds.length > 0) {
    const { data: validBottles } = await supabase
      .from('deposit_bottles')
      .select('id, status')
      .eq('deposit_id', deposit.id)
      .in('id', bottleIds);
    validBottleIds = (validBottles || [])
      .filter((b) => b.status !== 'consumed')
      .map((b) => b.id);
    if (validBottleIds.length === 0) {
      return NextResponse.json(
        { error: 'ไม่พบขวดที่เลือก หรือขวดถูกเบิกไปแล้ว' },
        { status: 400 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Create withdrawal request
  // One row per picked bottle so the bar can mark them off individually
  // (bottle_id linked); legacy/single-bottle requests fall through to a
  // single row with bottle_id=null and requested_qty=remaining_qty.
  // -----------------------------------------------------------------------
  // Table number: only meaningful for in-store withdrawals. For take-home
  // we explicitly null it out so the bar isn't confused by a stale value
  // copied from the original deposit.
  const finalTable = wType === 'in_store'
    ? (tableNumber?.trim() || deposit.table_number || null)
    : null;

  const baseRow = {
    deposit_id: deposit.id,
    store_id: deposit.store_id,
    line_user_id: lineUserId,
    customer_name: customerName || deposit.customer_name || 'ลูกค้า',
    product_name: deposit.product_name,
    withdrawal_type: wType,
    table_number: finalTable,
    status: 'pending' as const,
  };
  const insertRows = validBottleIds.length > 0
    ? validBottleIds.map((bottleId) => ({ ...baseRow, requested_qty: 1, bottle_id: bottleId }))
    : [{ ...baseRow, requested_qty: deposit.remaining_qty, bottle_id: null }];

  const { error: insertError } = await supabase.from('withdrawals').insert(insertRows);

  if (insertError) {
    return NextResponse.json(
      { error: 'ไม่สามารถส่งคำขอเบิกได้' },
      { status: 500 },
    );
  }

  const requestedQty = validBottleIds.length > 0 ? validBottleIds.length : deposit.remaining_qty;

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
      body: `${customerName || deposit.customer_name} ขอเบิก ${deposit.product_name} x${requestedQty}`,
      data: { depositId: deposit.id, productName: deposit.product_name },
    });
  } catch (err) {
    console.error('[Withdrawal] Failed to send push notification:', err);
  }

  // -----------------------------------------------------------------------
  // Send Action Card to store chat
  // -----------------------------------------------------------------------
  try {
    // For multi-bottle requests, surface which bottle slots the
    // customer chose so the bar sees "1/3, 3/3" instead of "x3" with
    // no detail. Look up bottle_no for the picked ids.
    let bottleLabels: string[] | undefined;
    if (validBottleIds.length > 0) {
      const { data: bottleRows } = await supabase
        .from('deposit_bottles')
        .select('bottle_no')
        .in('id', validBottleIds)
        .order('bottle_no');
      const total = deposit.quantity || 0;
      bottleLabels = (bottleRows || []).map((b) =>
        total > 0 ? `${b.bottle_no}/${total}` : String(b.bottle_no),
      );
    }
    const actionCard = buildWithdrawalActionCard({
      id: depositId,
      deposit_code: deposit.deposit_code,
      customer_name: customerName || deposit.customer_name || 'ลูกค้า',
      product_name: deposit.product_name,
      requested_qty: requestedQty,
      // Pass the customer's chosen table for in-store, null for take-home
      // (don't fall back to the original deposit's table — that may be
      // hours/days old and irrelevant to the current pickup).
      table_number: finalTable,
      withdrawal_type: wType,
    });
    if (bottleLabels && bottleLabels.length > 0) {
      const meta = actionCard.metadata;
      if (meta && typeof meta === 'object' && 'summary' in meta) {
        const m = meta as { summary: Record<string, unknown> };
        m.summary.items = `${deposit.product_name} x${requestedQty} (${bottleLabels.join(', ')})`;
      }
    }

    await sendBotMessage({
      storeId: deposit.store_id,
      ...actionCard,
    });
  } catch (err) {
    console.error('[Withdrawal] Failed to send chat action card:', err);
  }

  return NextResponse.json({ success: true });
}
